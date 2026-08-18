"""Vendor extended profile (documents, addresses, PICs, awarding, certifications) + blacklist + user delegation + mobile approve."""
from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from auth_utils import get_current_active_user
from db_models import get_db, now_iso

router = APIRouter(prefix="/api")


# ---------- Vendor Blacklist ----------
class BlacklistIn(BaseModel):
    blacklisted: bool
    reason: Optional[str] = None


def _is_effective_blacklist(v: dict) -> bool:
    if v.get("blacklisted"):
        return True
    ar = v.get("avg_rating")
    cnt = v.get("ratings_count") or 0
    return bool(ar and ar < 2 and cnt >= 2)


@router.post("/vendors/{vid}/blacklist")
async def toggle_blacklist(vid: str, payload: BlacklistIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    await db.vendors.update_one(
        {"id": vid},
        {"$set": {"blacklisted": payload.blacklisted, "blacklist_reason": payload.reason, "blacklisted_at": now_iso() if payload.blacklisted else None}},
    )
    return {"ok": True}


# ---------- Vendor Extended Profile ----------
class VendorProfileIn(BaseModel):
    company_name: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    npwp: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    vendor_notification: Optional[str] = None  # 'emails' | 'portal'
    # Documents (URLs from Supabase upload)
    siup_url: Optional[str] = None
    npwp_url: Optional[str] = None
    akta_url: Optional[str] = None
    awarding: List[dict] = []       # [{name, file}]
    certification: List[dict] = []  # [{name, file}]
    addresses: List[dict] = []      # [{label, address, city, country, postal_code}]
    pics: List[dict] = []           # [{name, role, phone, email}]


@router.put("/vendor-portal/profile-extended")
async def update_vendor_extended(payload: VendorProfileIn, user=Depends(get_current_active_user)):
    if user["role"] != "vendor" or not user.get("vendor_id"):
        raise HTTPException(403, "Vendor only")
    db = get_db()
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.vendors.update_one({"id": user["vendor_id"]}, {"$set": upd})
    return await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})


@router.put("/vendors/{vid}/profile-extended")
async def update_vendor_extended_by_admin(vid: str, payload: VendorProfileIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.vendors.update_one({"id": vid}, {"$set": upd})
    return await db.vendors.find_one({"id": vid}, {"_id": 0})


# ---------- Approval Delegation ----------
class DelegationIn(BaseModel):
    delegated_to: Optional[str] = None  # user_id, or null to clear
    delegated_until: Optional[str] = None  # ISO date


@router.put("/users/{uid}/delegation")
async def set_delegation(uid: str, payload: DelegationIn, user=Depends(get_current_active_user)):
    if user["id"] != uid and user["role"] != "admin":
        raise HTTPException(403, "Not allowed")
    db = get_db()
    await db.users.update_one(
        {"id": uid},
        {"$set": {"delegated_to": payload.delegated_to, "delegated_until": payload.delegated_until}},
    )
    return {"ok": True}


@router.get("/users/me/delegation")
async def get_my_delegation(user=Depends(get_current_active_user)):
    db = get_db()
    doc = await db.users.find_one({"id": user["id"]}, {"delegated_to": 1, "delegated_until": 1, "_id": 0})
    return doc or {}


# ---------- Mobile Approve (HMAC signed) ----------
def _sign(payload: str) -> str:
    secret = os.environ.get("JWT_SECRET", "")
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def make_approve_token(collection: str, doc_id: str, level: int, action: str) -> str:
    ts = int(time.time())
    base = f"{collection}:{doc_id}:{level}:{action}:{ts}"
    sig = _sign(base)
    return f"{base}:{sig}"


def _verify_token(token: str, max_age_hours: int = 168) -> tuple[str, str, int, str]:
    try:
        parts = token.split(":")
        if len(parts) != 6:
            raise HTTPException(400, "Invalid token")
        collection, doc_id, level, action, ts_s, sig = parts
        expected = _sign(f"{collection}:{doc_id}:{level}:{action}:{ts_s}")
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(400, "Bad signature")
        if int(time.time()) - int(ts_s) > max_age_hours * 3600:
            raise HTTPException(400, "Token expired")
        return collection, doc_id, int(level), action
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid token")


@router.get("/mobile-approve", response_class=HTMLResponse)
async def mobile_approve(token: str = Query(...), note: Optional[str] = None):
    collection, doc_id, level, action = _verify_token(token)
    db = get_db()
    doc = await db[collection].find_one({"id": doc_id})
    if not doc:
        return HTMLResponse("<h2>Dokumen tidak ditemukan.</h2>", status_code=404)
    if doc.get("status") != "pending_approval" or doc.get("current_level") != level:
        return HTMLResponse(f"<div style='font-family:sans-serif;padding:40px;max-width:520px;margin:auto'><h2>Status berubah</h2><p>Dokumen ini sudah tidak di level {level} atau sudah diselesaikan (status saat ini: <b>{doc.get('status')}</b>).</p></div>")
    approvals = doc.get("approvals") or []
    step = next((s for s in approvals if s["level"] == level), None)
    if not step:
        return HTMLResponse("<h2>Level tidak ditemukan</h2>", status_code=400)
    step["status"] = "approved" if action == "approve" else "rejected"
    step["at"] = now_iso()
    step["note"] = note or "(via mobile link)"
    step["via"] = "mobile-link"
    if action == "approve":
        remaining = [s for s in approvals if s["status"] == "pending"]
        if remaining:
            await db[collection].update_one({"id": doc_id}, {"$set": {"approvals": approvals, "current_level": min(s["level"] for s in remaining)}})
        else:
            await db[collection].update_one({"id": doc_id}, {"$set": {"approvals": approvals, "status": "approved", "current_level": 0}})
            if collection == "prs":
                bm = doc.get("budget_map") or {}
                for bid, amt in bm.items():
                    await db.budgets.update_one({"id": bid}, {"$inc": {"used_amount": float(amt)}})
    else:
        await db[collection].update_one({"id": doc_id}, {"$set": {"approvals": approvals, "status": "rejected"}})
    verb = "Approved ✅" if action == "approve" else "Rejected ❌"
    number = doc.get("pr_number") or doc.get("po_number") or doc_id
    return HTMLResponse(f"""
    <div style='font-family:system-ui,sans-serif;background:#F8FAFC;padding:0;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center'>
      <div style='background:white;padding:32px;max-width:480px;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.08)'>
        <h1 style='font-size:22px;color:#0F172A;margin:0 0 12px'>{verb}</h1>
        <p style='color:#475569'>Dokumen <b>{number}</b> level <b>{level}</b> berhasil di-{action}.</p>
        <a href='/' style='display:inline-block;margin-top:16px;padding:10px 16px;background:#0F172A;color:white;text-decoration:none;border-radius:4px'>Buka Portal</a>
      </div>
    </div>
    """)
