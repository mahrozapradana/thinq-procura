"""Vendor auto-suggest based on historical performance (rating + on-time + lead time)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends

from auth_utils import get_current_active_user
from native_pg_repositories import AnalyticsNativeRepository

router = APIRouter(prefix="/api")

@router.get("/vendor-suggestions")
async def suggest_vendors(product_ids: Optional[str] = None, top: int = 5, user=Depends(get_current_active_user)):
    """Ranked vendor recommendation. Score = 0.4*rating_score + 0.3*ontime_score + 0.3*leadtime_score."""
    _ = user
    return AnalyticsNativeRepository().vendor_suggestions(product_ids=product_ids, top=top)
