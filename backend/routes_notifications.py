"""In-app bell notifications (polling + SSE stream)."""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth_utils import get_current_active_user
from db_models import get_db, new_id, now_iso, clean

router = APIRouter(prefix="/api")

# In-process SSE fan-out: per-user asyncio queues (works for single-worker uvicorn)
_subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)


def _publish(user_id: str, payload: dict):
    """Push a notification payload to all active SSE streams for a user."""
    for q in list(_subscribers.get(user_id, [])):
        try:
            q.put_nowait(payload)
        except Exception:
            pass


async def create_notification(user_id: str, ntype: str, title: str, message: str, link: str = "", meta: dict | None = None):
    """Insert an in-app notification for a user + push via SSE + optionally email.

    Notification types (used for granular prefs):
      rfq_reply | approval | rating | po_new | general
    """
    try:
        db = get_db()
        doc = {
            "id": new_id(),
            "user_id": user_id,
            "type": ntype,
            "title": title,
            "message": message,
            "link": link,
            "meta": meta or {},
            "is_read": False,
            "created_at": now_iso(),
        }
        # Check user prefs for BELL channel (default: all types on)
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "notification_prefs": 1})
        prefs = (user or {}).get("notification_prefs") or {}
        bell_prefs = prefs.get("bell") if isinstance(prefs.get("bell"), dict) else {"_default": bool(prefs.get("bell", True))}
        email_prefs = prefs.get("email") if isinstance(prefs.get("email"), dict) else {"_default": bool(prefs.get("email", True))}
        bell_on = bell_prefs.get(ntype, bell_prefs.get("_default", True))
        email_on = email_prefs.get(ntype, email_prefs.get("_default", True))
        if bell_on:
            await db.notifications.insert_one(doc)
            _publish(user_id, {k: v for k, v in doc.items() if k != "_id"})
            # Cross-worker publish via Redis (if configured)
            try:
                from redis_pubsub import publish_to_redis
                await publish_to_redis(user_id, {k: v for k, v in doc.items() if k != "_id"})
            except Exception:
                pass
        # Email
        try:
            link_html = f'<p><a href="{link}">Buka detail</a></p>' if link else ''
            if email_on and user and user.get("email"):
                from notifications import send_email
                await send_email([user["email"]], f"[Procura] {title}", f"<p>{message}</p>{link_html}")
        except Exception:
            pass
        return clean(doc)
    except Exception:
        return None


async def notify_role(role: str, ntype: str, title: str, message: str, link: str = ""):
    db = get_db()
    users = await db.users.find({"role": role, "status": "active"}, {"id": 1, "_id": 0}).to_list(500)
    for u in users:
        await create_notification(u["id"], ntype, title, message, link)


@router.get("/notifications")
async def list_notifications(unread_only: bool = False, limit: int = 30, user=Depends(get_current_active_user)):
    db = get_db()
    q: dict = {"user_id": user["id"]}
    if unread_only:
        q["is_read"] = False
    items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    unread = await db.notifications.count_documents({"user_id": user["id"], "is_read": False})
    return {"items": items, "unread_count": unread}


class ReadIn(BaseModel):
    id: Optional[str] = None


@router.post("/notifications/{nid}/read")
async def mark_read(nid: str, user=Depends(get_current_active_user)):
    db = get_db()
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"is_read": True, "read_at": now_iso()}})
    return {"ok": True}


@router.post("/notifications/read-all")
async def mark_all_read(user=Depends(get_current_active_user)):
    db = get_db()
    r = await db.notifications.update_many({"user_id": user["id"], "is_read": False}, {"$set": {"is_read": True, "read_at": now_iso()}})
    return {"ok": True, "modified": r.modified_count}


@router.get("/notifications/stream")
async def notifications_stream(request: Request, user=Depends(get_current_active_user)):
    """SSE stream — pushes new notifications instantly to this user."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers[user["id"]].append(queue)

    async def event_gen():
        try:
            # initial ping
            yield f": connected user={user['id']}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=25.0)
                    yield f"event: notification\ndata: {json.dumps(payload)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            try:
                _subscribers[user["id"]].remove(queue)
            except ValueError:
                pass

    return StreamingResponse(event_gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


class PrefsIn(BaseModel):
    email: dict | bool = True  # legacy bool ok; dict = per-type {rfq_reply, approval, rating, po_new, general}
    bell: dict | bool = True


@router.get("/users/me/notification-prefs")
async def get_my_prefs(user=Depends(get_current_active_user)):
    db = get_db()
    u = await db.users.find_one({"id": user["id"]}, {"notification_prefs": 1, "_id": 0}) or {}
    return u.get("notification_prefs") or {"email": True, "bell": True}


@router.put("/users/me/notification-prefs")
async def set_my_prefs(payload: PrefsIn, user=Depends(get_current_active_user)):
    db = get_db()
    await db.users.update_one({"id": user["id"]}, {"$set": {"notification_prefs": payload.model_dump()}})
    return payload.model_dump()
