"""Vendor portal: self-registration + vendor-facing endpoints."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from auth_utils import get_current_active_user
from db_models import get_db, new_id, now_iso, clean, gen_number

router = APIRouter(prefix="/api")


class VendorRegisterIn(BaseModel):
    company_name: str
    name: str  # contact person
    email: EmailStr
    phone: Optional[str] = None
    address: Optional[str] = None
    npwp: Optional[str] = None
    is_importer: bool = False
    categories: List[str] = []
    bank_account: Optional[str] = None
    description: Optional[str] = None


@router.post("/vendor/register")
async def vendor_register(payload: VendorRegisterIn):
    """Public vendor self-registration."""
    db = get_db()
    email = payload.email.lower()
    existing = await db.vendors.find_one({"email": email})
    if existing:
        raise HTTPException(400, "Email vendor sudah terdaftar")
    doc = {
        "id": new_id(),
        "status": "pending_approval",
        "user_id": None,
        "created_at": now_iso(),
        **payload.model_dump(),
        "email": email,
    }
    await db.vendors.insert_one(doc)
    return {"ok": True, "vendor_id": doc["id"], "message": "Pendaftaran diterima. Tunggu persetujuan tim procurement."}


# ---------- Vendor portal endpoints ----------
def _require_vendor(user: dict) -> str:
    if user["role"] != "vendor" or not user.get("vendor_id"):
        raise HTTPException(403, "Vendor portal only")
    return user["vendor_id"]


@router.get("/vendor-portal/profile")
async def get_vendor_profile(user=Depends(get_current_active_user)):
    vid = _require_vendor(user)
    db = get_db()
    v = await db.vendors.find_one({"id": vid}, {"_id": 0})
    return v


class ProfileUpdateIn(BaseModel):
    phone: Optional[str] = None
    address: Optional[str] = None
    npwp: Optional[str] = None
    bank_account: Optional[str] = None
    description: Optional[str] = None
    categories: Optional[List[str]] = None


@router.put("/vendor-portal/profile")
async def update_vendor_profile(payload: ProfileUpdateIn, user=Depends(get_current_active_user)):
    vid = _require_vendor(user)
    db = get_db()
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.vendors.update_one({"id": vid}, {"$set": upd})
    return await db.vendors.find_one({"id": vid}, {"_id": 0})


@router.get("/vendor-portal/tenders")
async def vendor_tenders(user=Depends(get_current_active_user)):
    vid = _require_vendor(user)
    db = get_db()
    q = {
        "status": {"$in": ["open", "closed", "awarded"]},
        "$or": [
            {"invited_vendor_ids": vid},
            {"invited_vendor_ids": []},
        ],
    }
    return await db.tenders.find(q, {"_id": 0}).to_list(1000)


class BidIn(BaseModel):
    price: float
    delivery_days: Optional[int] = None
    notes: Optional[str] = None


@router.post("/vendor-portal/tenders/{tid}/bid")
async def submit_bid(tid: str, payload: BidIn, user=Depends(get_current_active_user)):
    vid = _require_vendor(user)
    db = get_db()
    t = await db.tenders.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Tender not found")
    if t.get("status") != "open":
        raise HTTPException(400, "Tender not open")
    bids = t.get("bids", [])
    bids = [b for b in bids if b["vendor_id"] != vid]  # remove old bid
    bids.append({
        "vendor_id": vid,
        "vendor_name": user["name"],
        "price": payload.price,
        "delivery_days": payload.delivery_days,
        "notes": payload.notes,
        "status": "submitted",
        "submitted_at": now_iso(),
    })
    await db.tenders.update_one({"id": tid}, {"$set": {"bids": bids}})
    return {"ok": True}


@router.post("/vendor-portal/tenders/{tid}/decline")
async def decline_tender(tid: str, user=Depends(get_current_active_user)):
    vid = _require_vendor(user)
    db = get_db()
    t = await db.tenders.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Not found")
    bids = t.get("bids", [])
    bids = [b for b in bids if b["vendor_id"] != vid]
    bids.append({
        "vendor_id": vid,
        "vendor_name": user["name"],
        "status": "declined",
        "submitted_at": now_iso(),
    })
    await db.tenders.update_one({"id": tid}, {"$set": {"bids": bids}})
    return {"ok": True}


@router.get("/vendor-portal/pos")
async def vendor_pos(user=Depends(get_current_active_user)):
    vid = _require_vendor(user)
    db = get_db()
    return await db.pos.find({"vendor_id": vid}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.get("/vendor-portal/shipments")
async def vendor_shipments(user=Depends(get_current_active_user)):
    vid = _require_vendor(user)
    db = get_db()
    return await db.pos.find(
        {"vendor_id": vid, "shipping_status": {"$in": ["pending", "waiting_delivery", "partial"]}}, {"_id": 0}
    ).to_list(1000)


@router.get("/vendor-portal/invoices")
async def vendor_invoices(user=Depends(get_current_active_user)):
    vid = _require_vendor(user)
    db = get_db()
    return await db.invoices.find({"vendor_id": vid}, {"_id": 0}).sort("created_at", -1).to_list(1000)


class InvoiceIn(BaseModel):
    po_id: str
    amount: float
    due_date: Optional[str] = None
    notes: Optional[str] = None
    ls_document_id: Optional[str] = None


@router.post("/vendor-portal/invoices")
async def submit_invoice(payload: InvoiceIn, user=Depends(get_current_active_user)):
    vid = _require_vendor(user)
    db = get_db()
    po = await db.pos.find_one({"id": payload.po_id})
    if not po:
        raise HTTPException(404, "PO not found")
    doc = {
        "id": new_id(),
        "invoice_number": gen_number("INV"),
        "vendor_id": vid,
        "po_id": payload.po_id,
        "po_number": po.get("po_number"),
        "amount": payload.amount,
        "status": "outstanding",
        "due_date": payload.due_date,
        "notes": payload.notes,
        "ls_document_id": payload.ls_document_id,
        "is_bonded": po.get("po_type") == "BONDED",
        "created_at": now_iso(),
    }
    await db.invoices.insert_one(doc)
    await db.pos.update_one({"id": payload.po_id}, {"$set": {"invoice_status": "submitted"}})
    return clean(doc)


# ---------- LS documents (customs) ----------
class LSDocIn(BaseModel):
    doc_type: str = "LS"  # LS, PIB, BC23, etc
    po_id: Optional[str] = None
    reference_number: str
    hs_codes: List[str] = []
    file_url: Optional[str] = None
    notes: Optional[str] = None


@router.get("/vendor-portal/ls-documents")
async def list_ls_docs(user=Depends(get_current_active_user)):
    vid = _require_vendor(user)
    db = get_db()
    return await db.ls_documents.find({"vendor_id": vid}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.post("/vendor-portal/ls-documents")
async def create_ls_doc(payload: LSDocIn, user=Depends(get_current_active_user)):
    vid = _require_vendor(user)
    db = get_db()
    doc = {
        "id": new_id(),
        "vendor_id": vid,
        "status": "submitted",
        "created_at": now_iso(),
        **payload.model_dump(),
    }
    await db.ls_documents.insert_one(doc)
    return clean(doc)


# Procurement side: list all LS docs
@router.get("/ls-documents")
async def list_all_ls(user=Depends(get_current_active_user)):
    db = get_db()
    return await db.ls_documents.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


# All invoices (procurement/finance side)
@router.get("/invoices")
async def list_all_invoices(user=Depends(get_current_active_user)):
    db = get_db()
    return await db.invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.post("/invoices/{iid}/pay")
async def pay_invoice(iid: str, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "finance"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    await db.invoices.update_one({"id": iid}, {"$set": {"status": "paid", "paid_at": now_iso()}})
    return {"ok": True}
