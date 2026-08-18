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
