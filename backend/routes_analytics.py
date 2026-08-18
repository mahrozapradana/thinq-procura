"""Vendor analytics + company logo/signature settings."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from auth_utils import get_current_active_user
from db_models import get_db, now_iso

router = APIRouter(prefix="/api")


@router.get("/dashboard/vendor-analytics")
async def vendor_analytics(user=Depends(get_current_active_user)):
    """Per-vendor: total PO value, count, avg_rating, on-time %, invoice paid."""
    db = get_db()
    vendors = await db.vendors.find({"status": "approved"}, {"_id": 0}).to_list(1000)
    result = []
    for v in vendors:
        pos = await db.pos.find({"vendor_id": v["id"]}, {"_id": 0}).to_list(1000)
        completed = [p for p in pos if p.get("status") == "completed"]
        total_value = sum(float(p.get("amount_total") or p.get("total") or 0) for p in pos)
        # on-time: has receipt on/before delivery_date
        on_time = 0
        with_delivery = 0
        for p in completed:
            if p.get("delivery_date"):
                with_delivery += 1
                recs = await db.goods_receipts.find({"po_id": p["id"]}, {"_id": 0}).to_list(20)
                if recs:
                    latest = max(r.get("created_at", "") for r in recs)
                    if latest[:10] <= p["delivery_date"]:
                        on_time += 1
        on_time_pct = (on_time / with_delivery * 100.0) if with_delivery else None
        invoices = await db.invoices.find({"vendor_id": v["id"]}, {"_id": 0}).to_list(1000)
        paid = sum(float(i.get("amount") or 0) for i in invoices if i.get("status") == "paid")
        outstanding = sum(float(i.get("amount") or 0) for i in invoices if i.get("status") == "outstanding")
        result.append({
            "vendor_id": v["id"],
            "vendor_name": v.get("company_name"),
            "po_count": len(pos),
            "po_completed": len(completed),
            "total_value": total_value,
            "avg_rating": v.get("avg_rating") or 0,
            "ratings_count": v.get("ratings_count") or 0,
            "on_time_pct": round(on_time_pct, 1) if on_time_pct is not None else None,
            "invoice_paid": paid,
            "invoice_outstanding": outstanding,
            "blacklisted": bool(v.get("blacklisted")),
        })
    result.sort(key=lambda x: -x["total_value"])
    return result


class BrandingIn(BaseModel):
    logo_url: Optional[str] = None
    signature_url: Optional[str] = None
    signature_name: Optional[str] = None


@router.put("/settings/branding")
async def update_branding(payload: BrandingIn, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    db = get_db()
    await db.company_settings.update_one(
        {"id": "singleton-company"},
        {"$set": {**{k: v for k, v in payload.model_dump().items() if v is not None}, "updated_at": now_iso()}},
        upsert=True,
    )
    return await db.company_settings.find_one({"id": "singleton-company"}, {"_id": 0})
