"""Cron endpoints for scheduled tasks (called by Emergent platform)."""
from __future__ import annotations

import asyncio
import hmac
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request

from db_models import get_db
from notifications import send_email, resolve_approver_emails

router = APIRouter(prefix="/api/cron")
logger = logging.getLogger("epr.cron")

SLA_HOURS = 48  # 2 business days ≈ 48h


def _verify_auth(auth: str | None):
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not secret:
        raise HTTPException(500, "WEBHOOK_CRON_SECRET not configured")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer")
    token = auth[7:]
    if not hmac.compare_digest(token, secret):
        raise HTTPException(401, "Invalid bearer")


async def _dispatch_sla_alerts(run_id: str):
    """Background job: find pending approvals older than SLA_HOURS and email approvers."""
    db = get_db()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=SLA_HOURS)
    cutoff_iso = cutoff.isoformat()
    sent_count = 0
    for collection, kind in (("prs", "Purchase Request"), ("pos", "Purchase Order"), ("budgets", "Budget")):
        docs = await db[collection].find(
            {"status": "pending_approval", "created_at": {"$lt": cutoff_iso}},
            {"_id": 0},
        ).to_list(1000)
        for d in docs:
            approvals = d.get("approvals") or []
            cur = d.get("current_level") or 0
            step = next((s for s in approvals if s.get("level") == cur), None)
            if not step:
                continue
            emails = await resolve_approver_emails(step)
            if not emails:
                continue
            number = d.get("pr_number") or d.get("po_number") or d.get("id")
            total = d.get("total") or d.get("amount") or 0
            age_h = int((datetime.now(timezone.utc) - datetime.fromisoformat(d["created_at"])).total_seconds() / 3600)
            subject = f"[Procura] SLA Reminder – {kind} {number} menunggu {age_h}h"
            body = f"""
            <h2>⏰ Reminder: Approval belum dilakukan</h2>
            <p><b>{kind} {number}</b> menunggu approval level <b>{cur}</b> selama <b>{age_h} jam</b>.</p>
            <ul>
              <li>Total: Rp {total:,.0f}</li>
              <li>Role: {step.get('role')}</li>
            </ul>
            <p>Mohon segera login ke Procura untuk approve/reject.</p>
            <p style="color:#94A3B8;font-size:11px;">Cron run: {run_id}</p>
            """.replace(",", ".")
            ok = await send_email(emails, subject, body)
            if ok:
                sent_count += 1
    logger.info(f"[sla] run={run_id} sent={sent_count}")


@router.post("/approval-sla-alerts")
async def approval_sla_alerts(
    request: Request,
    background: BackgroundTasks,
    authorization: str | None = Header(default=None),
    x_webhook_id: str | None = Header(default=None),
):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _verify_auth(authorization)
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = x_webhook_id or (body.get("run_id") if isinstance(body, dict) else None) or "manual"
    background.add_task(_dispatch_sla_alerts, run_id)
    return {"ok": True, "run_id": run_id, "enqueued": True}



async def _dispatch_draft_reminders(run_id: str):
    """Find open tenders with deadline in 12-36h and email vendors who have draft bids."""
    db = get_db()
    now = datetime.now(timezone.utc)
    lo = now + timedelta(hours=12)
    hi = now + timedelta(hours=36)
    sent = 0
    async for t in db.tenders.find({"status": "open", "deadline": {"$exists": True, "$ne": None}}, {"_id": 0}):
        try:
            dl_raw = t.get("deadline") or ""
            dl = datetime.fromisoformat(dl_raw.replace("Z", "+00:00")) if "T" in dl_raw else datetime.fromisoformat(dl_raw + "T23:59:59+00:00")
            if dl.tzinfo is None:
                dl = dl.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if not (lo <= dl <= hi):
            continue
        draft_vendors = [b.get("vendor_id") for b in (t.get("bids") or []) if b.get("status") == "draft"]
        if not draft_vendors:
            continue
        users = await db.users.find({"role": "vendor", "vendor_id": {"$in": draft_vendors}}, {"_id": 0, "email": 1, "name": 1, "vendor_id": 1}).to_list(200)
        if not users:
            continue
        emails = [u["email"] for u in users if u.get("email")]
        hours_left = int((dl - now).total_seconds() / 3600)
        subject = f"[Procura] Reminder: draft bid untuk {t.get('tender_number')} akan expire dalam {hours_left} jam"
        body = f"""
        <h2>⏰ Draft bid belum disubmit</h2>
        <p>Anda memiliki draft bid untuk tender <b>{t.get('tender_number')} — {t.get('title')}</b>.</p>
        <p>Deadline: <b>{dl.strftime('%d %b %Y %H:%M UTC')}</b> — <b>{hours_left} jam</b> lagi.</p>
        <p>Silakan login ke Vendor Portal &rarr; Tender untuk melanjutkan atau submit bid Anda.</p>
        <p style="color:#94A3B8;font-size:11px;">Cron run: {run_id}</p>
        """
        ok = await send_email(emails, subject, body)
        if ok:
            sent += 1
    logger.info(f"[draft-reminder] run={run_id} sent={sent}")


@router.get("/tender-draft-reminders")
async def tender_draft_reminders(request: Request, background: BackgroundTasks, x_webhook_id: str | None = Header(default=None)):
    """No-auth cron: platform can hit this via GET. Runs quickly, enqueues heavy work."""
    run_id = x_webhook_id or "manual"
    background.add_task(_dispatch_draft_reminders, run_id)
    return {"ok": True, "run_id": run_id, "enqueued": True}
