"""Tenant-scoped branch comparison analytics (A/B dashboard).

Compares procurement KPIs (spend, avg PR-to-PO cycle, on-time %, savings via vendor reply)
per department (treated as branch/cost-center).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from auth_utils import get_current_active_user
from native_pg_repositories import AnalyticsNativeRepository

router = APIRouter(prefix="/api/analytics")

@router.get("/branches-comparison")
async def branches_comparison(
    year: Optional[int] = None,
    user=Depends(get_current_active_user),
):
    if user["role"] not in ("admin", "procurement", "finance"):
        raise HTTPException(403, "Not allowed")
    return AnalyticsNativeRepository().branches_comparison(year)
