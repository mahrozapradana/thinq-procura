"""In-app bell notifications (polling, no websocket needed)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth_utils import get_current_active_user
from db_models import get_db, new_id, now_iso, clean

router = APIRouter(prefix="/api")


async def create_notification(user_id: str, ntype: str, title: str, message: str, link: str = "", meta: dict | None = None):
    """Insert an in-app notification for a user. Safe helper – swallow errors."""
    try:
        db = get_db()
        doc = {
            "id": new_id(),
            "user_id": user_id,
            "type": ntype,  # rfq_reply | po_approved | rating_pending | tax_report | etc
            "title": title,
            "message": message,
            "link": link,
            "meta": meta or {},
            "is_read": False,
            "created_at": now_iso(),
        }
        await db.notifications.insert_one(doc)
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
