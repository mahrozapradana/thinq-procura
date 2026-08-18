"""Inventory: goods receipts and goods returns."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_active_user
from db_models import get_db, new_id, now_iso, clean, gen_number

router = APIRouter(prefix="/api")


class ReceiptItemIn(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    qty_ordered: float
    qty_received: float
    note: Optional[str] = None
    lot_number: Optional[str] = None  # Support single lot; use lots[] for multi
    lots: Optional[List[dict]] = None  # [{lot_number, qty, expiry_date, location_id}]


class ReceiptIn(BaseModel):
    po_id: str
    warehouse_id: Optional[str] = None
    location_id: Optional[str] = None
    items: List[ReceiptItemIn]
    notes: Optional[str] = None


@router.get("/goods-receipts")
async def list_receipts(user=Depends(get_current_active_user)):
    db = get_db()
    return await db.goods_receipts.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.post("/goods-receipts")
async def create_receipt(payload: ReceiptIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "warehouse", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    po = await db.pos.find_one({"id": payload.po_id})
    if not po:
        raise HTTPException(404, "PO not found")
    doc = {
        "id": new_id(),
        "receipt_number": gen_number("GR"),
        "po_id": payload.po_id,
        "po_number": po.get("po_number"),
        "items": [i.model_dump() for i in payload.items],
        "notes": payload.notes,
        "received_by": user["id"],
        "received_by_name": user["name"],
        "status": "received",
        "created_at": now_iso(),
    }
    await db.goods_receipts.insert_one(doc)
    # Update PO shipping status
    total_ord = sum(i.qty_ordered for i in payload.items)
    total_rec = sum(i.qty_received for i in payload.items)
    new_status = "completed" if total_rec >= total_ord else "partial"
    await db.pos.update_one({"id": payload.po_id}, {"$set": {"shipping_status": new_status, "status": new_status if new_status == "completed" else po.get("status")}})
    # Mark PRs as received in warehouse
    if po.get("pr_ids"):
        await db.prs.update_many({"id": {"$in": po["pr_ids"]}}, {"$set": {"warehouse_status": new_status}})
    # Auto-send rating reminder to buyer if PO is now fully completed
    if new_status == "completed" and not po.get("vendor_rating"):
        try:
            from notifications import send_rating_reminder
            await send_rating_reminder({**po, "shipping_status": new_status, "status": "completed"})
        except Exception:
            pass
    return clean(doc)


class ReturnItemIn(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    qty: float
    reason: Optional[str] = None


class ReturnIn(BaseModel):
    receipt_id: str
    items: List[ReturnItemIn]
    reason: Optional[str] = None


@router.get("/goods-returns")
async def list_returns(user=Depends(get_current_active_user)):
    db = get_db()
    return await db.goods_returns.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.post("/goods-returns")
async def create_return(payload: ReturnIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "warehouse", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    receipt = await db.goods_receipts.find_one({"id": payload.receipt_id})
    if not receipt:
        raise HTTPException(404, "Receipt not found")
    doc = {
        "id": new_id(),
        "return_number": gen_number("RET"),
        "receipt_id": payload.receipt_id,
        "receipt_number": receipt.get("receipt_number"),
        "po_id": receipt.get("po_id"),
        "items": [i.model_dump() for i in payload.items],
        "reason": payload.reason,
        "status": "returned",
        "created_by": user["id"],
        "created_at": now_iso(),
    }
    await db.goods_returns.insert_one(doc)
    return clean(doc)
