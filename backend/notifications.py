"""SMTP email notifications. Config stored in db.notification_settings singleton."""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from db_models import get_db

logger = logging.getLogger("epr.notif")

SETTINGS_ID = "singleton-notif"


async def get_smtp_settings() -> Optional[dict]:
    db = get_db()
    doc = await db.notification_settings.find_one({"id": SETTINGS_ID}, {"_id": 0})
    return doc


async def send_email(to: list[str], subject: str, body_html: str) -> bool:
    if not to:
        return False
    cfg = await get_smtp_settings()
    if not cfg or not cfg.get("enabled") or not cfg.get("smtp_host"):
        logger.info(f"[email:disabled] would send to {to} subject={subject!r}")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = cfg.get("from_email") or cfg.get("smtp_username", "")
        msg["To"] = ", ".join(to)
        msg.attach(MIMEText(body_html, "html"))
        port = int(cfg.get("smtp_port") or 587)
        use_tls = bool(cfg.get("use_tls", True))
        if use_tls:
            server = smtplib.SMTP(cfg["smtp_host"], port, timeout=15)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(cfg["smtp_host"], port, timeout=15)
        if cfg.get("smtp_username"):
            server.login(cfg["smtp_username"], cfg.get("smtp_password") or "")
        server.sendmail(msg["From"], to, msg.as_string())
        server.quit()
        logger.info(f"[email:sent] to={to} subject={subject!r}")
        return True
    except Exception as e:
        logger.exception(f"[email:error] {e}")
        return False


async def resolve_approver_emails(step: dict) -> list[str]:
    db = get_db()
    if step.get("approver_id"):
        u = await db.users.find_one({"id": step["approver_id"]}, {"email": 1, "_id": 0})
        return [u["email"]] if u else []
    role = step.get("role")
    if not role:
        return []
    cursor = db.users.find({"role": role, "status": "active"}, {"email": 1, "_id": 0})
    users = await cursor.to_list(200)
    return [u["email"] for u in users if u.get("email")]


async def notify_pending_approval(doc_type: str, doc: dict):
    """Notify approvers at current level that something waits for them."""
    approvals = doc.get("approvals") or []
    cur = doc.get("current_level")
    if not cur:
        return
    step = next((s for s in approvals if s["level"] == cur), None)
    if not step:
        return
    emails = await resolve_approver_emails(step)
    if not emails:
        return
    number = doc.get("pr_number") or doc.get("po_number") or doc.get("id")
    total = doc.get("total") or doc.get("amount")
    # Mobile approve link (HMAC signed)
    try:
        from routes_extended import make_approve_token
        collection = "prs" if doc.get("pr_number") else ("pos" if doc.get("po_number") else "budgets")
        base_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
        approve_token = make_approve_token(collection, doc["id"], cur, "approve")
        reject_token = make_approve_token(collection, doc["id"], cur, "reject")
        approve_link = f"{base_url}/api/mobile-approve?token={approve_token}"
        reject_link = f"{base_url}/api/mobile-approve?token={reject_token}"
        buttons = f"""
        <div style="margin:16px 0">
          <a href="{approve_link}" style="display:inline-block;padding:12px 22px;background:#059669;color:white;text-decoration:none;border-radius:4px;font-weight:600;margin-right:8px">✓ Approve</a>
          <a href="{reject_link}" style="display:inline-block;padding:12px 22px;background:#DC2626;color:white;text-decoration:none;border-radius:4px;font-weight:600">✗ Reject</a>
        </div>
        <p style="color:#94A3B8;font-size:11px">Tautan di atas dapat digunakan langsung dari HP tanpa login.</p>
        """
    except Exception:
        buttons = ""
    subject = f"[Procura] Approval Level {cur} diperlukan – {doc_type} {number}"
    body = f"""
    <div style="font-family:system-ui,sans-serif;padding:20px;max-width:540px">
      <h2 style="color:#0F172A;margin:0 0 8px">Approval diperlukan</h2>
      <p>Anda ditugaskan sebagai approver level <b>{cur}</b> untuk {doc_type}.</p>
      <ul>
        <li>Nomor: <b>{number}</b></li>
        <li>Total: <b>Rp {total:,.0f}</b></li>
        <li>Level Role: <b>{step.get('role')}</b></li>
      </ul>
      {buttons}
    </div>
    """.replace(",", ".")
    await send_email(emails, subject, body)
