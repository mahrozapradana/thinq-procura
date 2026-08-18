"""Daily notification digest for users who opted out of realtime email."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter

from db_models import get_db
from notifications import send_email

router = APIRouter(prefix="/api/cron")


@router.get("/notification-digest")
async def notification_digest():
    """Called daily. Sends per-user digest of last-24h notifications to users
    who have realtime email OFF but want the digest (bell channel indicates active user)."""
    db = get_db()
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    # Group notifications by user_id
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}, "items": {"$push": {"type": "$type", "title": "$title", "message": "$message", "link": "$link", "created_at": "$created_at"}}}},
    ]
    groups = await db.notifications.aggregate(pipeline).to_list(1000)
    sent = 0
    for g in groups:
        user = await db.users.find_one({"id": g["_id"]}, {"_id": 0, "email": 1, "name": 1, "notification_prefs": 1})
        if not user or not user.get("email"):
            continue
        prefs = user.get("notification_prefs") or {}
        email_prefs = prefs.get("email") if isinstance(prefs.get("email"), dict) else {"_default": bool(prefs.get("email", True))}
        # Only digest users who explicitly opted OUT of realtime email but not of general/digest
        realtime_email_off = not any(email_prefs.get(k, email_prefs.get("_default", True)) for k in ("rfq_reply", "approval", "rating", "po_new"))
        want_digest = email_prefs.get("digest", True)  # default: yes
        if not (realtime_email_off and want_digest):
            continue
        # Build HTML
        def _fmt(n):
            link_html = f'<a href="{n["link"]}">Buka</a>' if n.get("link") else ""
            ts = n["created_at"][:16].replace("T", " ")
            return (
                f'<tr><td style="padding:8px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B">{ts}</td>'
                f'<td style="padding:8px;border-bottom:1px solid #E2E8F0"><b>{n["title"]}</b><br>'
                f'<span style="font-size:12px;color:#475569">{n["message"]}</span></td>'
                f'<td style="padding:8px;border-bottom:1px solid #E2E8F0">{link_html}</td></tr>'
            )
        rows = "".join(_fmt(n) for n in g["items"][:50])
        body = f"""
        <div style="font-family:system-ui,sans-serif;padding:20px;max-width:640px">
          <h2 style="color:#0F172A;margin:0 0 8px">Ringkasan Notifikasi 24 Jam Terakhir</h2>
          <p>Halo {user.get('name','')}, berikut {g['count']} notifikasi Anda:</p>
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #E2E8F0">
            <thead><tr style="background:#F1F5F9"><th style="padding:8px;text-align:left;font-size:11px">Waktu</th><th style="padding:8px;text-align:left;font-size:11px">Notifikasi</th><th style="padding:8px;font-size:11px">Aksi</th></tr></thead>
            <tbody>{rows}</tbody>
          </table>
          <p style="color:#94A3B8;font-size:11px;margin-top:12px">Anda menerima ringkasan ini karena preferensi Email Realtime dimatikan. Ubah di Settings > Preferensi Notif.</p>
        </div>
        """
        try:
            await send_email([user["email"]], f"[Procura] Ringkasan {g['count']} notifikasi 24 jam terakhir", body)
            sent += 1
        except Exception:
            pass
    return {"ok": True, "digest_sent": sent, "groups": len(groups)}
