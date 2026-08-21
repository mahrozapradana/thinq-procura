"""Vendor analytics + company logo/signature settings."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from auth_utils import get_current_active_user
from db_models import get_db, now_iso
from native_pg_repositories import AnalyticsNativeRepository

router = APIRouter(prefix="/api")


@router.get("/dashboard/vendor-analytics")
async def vendor_analytics(user=Depends(get_current_active_user)):
    """Per-vendor: total PO value, count, avg_rating, on-time %, invoice paid."""
    _ = user
    return AnalyticsNativeRepository().vendor_analytics()


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
