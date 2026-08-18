"""Auto-fetch daily FX rates from public JSON API (fallback for BI JISDOR).

Uses https://open.er-api.com/v6/latest/USD which mirrors interbank rates close to BI JISDOR.
Bank Indonesia's official endpoint requires SOAP/WSDL which is fragile; this public API is
sufficient for reference rates that admin can still override manually in Settings.
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException

from auth_utils import get_current_active_user
from db_models import get_db, now_iso

router = APIRouter(prefix="/api")


async def _fetch_rates() -> dict:
    """Return {USD: rate_to_IDR, SGD: rate_to_IDR, JPY: rate_to_IDR}."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get("https://open.er-api.com/v6/latest/USD")
        r.raise_for_status()
        data = r.json()
    if data.get("result") != "success":
        raise RuntimeError(data.get("error-type", "fx fetch failed"))
    rates = data["rates"]
    idr_per_usd = float(rates["IDR"])
    idr_per_sgd = idr_per_usd / float(rates["SGD"])
    idr_per_jpy = idr_per_usd / float(rates["JPY"])
    return {
        "USD": round(idr_per_usd, 2),
        "SGD": round(idr_per_sgd, 2),
        "JPY": round(idr_per_jpy, 4),
    }


@router.post("/settings/fetch-fx-rates")
async def fetch_fx_rates(user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "finance", "procurement"):
        raise HTTPException(403, "Not allowed")
    try:
        rates = await _fetch_rates()
    except Exception as e:
        raise HTTPException(502, f"Gagal ambil kurs: {e}")
    db = get_db()
    await db.company_settings.update_one(
        {"id": "singleton-company"},
        {"$set": {
            "exchange_rates": rates,
            "exchange_rates_fetched_at": now_iso(),
            "exchange_rates_source": "open.er-api.com (BI JISDOR proxy)",
        }},
        upsert=True,
    )
    return {"ok": True, "rates": rates, "fetched_at": datetime.now(timezone.utc).isoformat(), "source": "open.er-api.com"}


@router.get("/cron/fetch-fx-rates")
async def cron_fetch_fx_rates():
    """Called daily by platform cron (no auth). Idempotent."""
    try:
        rates = await _fetch_rates()
        db = get_db()
        await db.company_settings.update_one(
            {"id": "singleton-company"},
            {"$set": {"exchange_rates": rates, "exchange_rates_fetched_at": now_iso()}},
            upsert=True,
        )
        return {"ok": True, "rates": rates}
    except Exception as e:
        return {"ok": False, "error": str(e)}
