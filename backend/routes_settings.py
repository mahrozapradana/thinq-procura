"""Company settings + Odoo XML-RPC integration + SMTP notification settings."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_active_user
from db_models import get_db, new_id, now_iso
from odoo_client import sync_products_to_odoo, sync_vendors_to_odoo, sync_pos_to_odoo, test_odoo

router = APIRouter(prefix="/api")


COMPANY_ID = "singleton-company"
NOTIF_ID = "singleton-notif"


class CompanySettingsIn(BaseModel):
    name: str
    is_bonded_zone: bool = True
    currency: str = "IDR"
    address: Optional[str] = None
    npwp: Optional[str] = None
    email: Optional[str] = None
    reapproval_threshold_pct: float = 5.0
    exchange_rates: Optional[dict] = None
    brand_color: Optional[str] = None
    brand_logo_url: Optional[str] = None
    brand_warning_color: Optional[str] = None  # secondary palette
    brand_success_color: Optional[str] = None
    custom_domain: Optional[str] = None  # e.g. procura.perusahaan.com


@router.get("/settings/company")
async def get_company(user=Depends(get_current_active_user)):
    db = get_db()
    doc = await db.company_settings.find_one({"id": COMPANY_ID}, {"_id": 0})
    if not doc:
        doc = {
            "id": COMPANY_ID,
            "name": "PT Sample Kawasan Berikat",
            "is_bonded_zone": True,
            "currency": "IDR",
            "address": None,
            "npwp": None,
            "email": None,
            "created_at": now_iso(),
        }
        await db.company_settings.insert_one(doc)
        doc.pop("_id", None)
    return doc


@router.put("/settings/company")
async def update_company(payload: CompanySettingsIn, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    db = get_db()
    await db.company_settings.update_one(
        {"id": COMPANY_ID},
        {"$set": {**payload.model_dump(), "updated_at": now_iso()}},
        upsert=True,
    )
    return await db.company_settings.find_one({"id": COMPANY_ID}, {"_id": 0})


class OdooSettingsIn(BaseModel):
    odoo_url: Optional[str] = None
    odoo_db: Optional[str] = None
    odoo_username: Optional[str] = None
    odoo_api_key: Optional[str] = None
    enabled: bool = False


@router.get("/settings/odoo")
async def get_odoo(user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    db = get_db()
    doc = await db.odoo_settings.find_one({"id": COMPANY_ID}, {"_id": 0})
    if not doc:
        doc = {
            "id": COMPANY_ID,
            "odoo_url": "",
            "odoo_db": "",
            "odoo_username": "",
            "odoo_api_key": "",
            "enabled": False,
            "last_sync": None,
        }
    if doc.get("odoo_api_key"):
        doc["odoo_api_key"] = "***"
    return doc


@router.put("/settings/odoo")
async def update_odoo(payload: OdooSettingsIn, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    db = get_db()
    data = payload.model_dump()
    # Don't overwrite stored api_key when frontend passes the masked value
    if data.get("odoo_api_key") in ("***", ""):
        existing = await db.odoo_settings.find_one({"id": COMPANY_ID}) or {}
        data["odoo_api_key"] = existing.get("odoo_api_key", "")
    await db.odoo_settings.update_one(
        {"id": COMPANY_ID},
        {"$set": {**data, "updated_at": now_iso()}},
        upsert=True,
    )
    doc = await db.odoo_settings.find_one({"id": COMPANY_ID}, {"_id": 0})
    if doc and doc.get("odoo_api_key"):
        doc["odoo_api_key"] = "***"
    return doc


@router.post("/odoo/sync/products")
async def sync_products(user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    result = await sync_products_to_odoo()
    db = get_db()
    await db.odoo_settings.update_one({"id": COMPANY_ID}, {"$set": {"last_sync": now_iso()}}, upsert=True)
    return result


@router.post("/odoo/sync/vendors")
async def sync_vendors(user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    result = await sync_vendors_to_odoo()
    db = get_db()
    await db.odoo_settings.update_one({"id": COMPANY_ID}, {"$set": {"last_sync": now_iso()}}, upsert=True)
    return result


@router.post("/odoo/sync/pos")
async def sync_pos(user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    result = await sync_pos_to_odoo()
    db = get_db()
    await db.odoo_settings.update_one({"id": COMPANY_ID}, {"$set": {"last_sync": now_iso()}}, upsert=True)
    return result


@router.post("/odoo/test")
async def odoo_test(user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    return await test_odoo()


# ---------- SMTP / Notification settings ----------
class SmtpSettingsIn(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    from_email: Optional[str] = None
    use_tls: bool = True
    enabled: bool = False


@router.get("/settings/notifications")
async def get_notif(user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    db = get_db()
    doc = await db.notification_settings.find_one({"id": NOTIF_ID}, {"_id": 0})
    if not doc:
        doc = {"id": NOTIF_ID, "smtp_host": "", "smtp_port": 587, "smtp_username": "", "smtp_password": "", "from_email": "", "use_tls": True, "enabled": False}
    if doc.get("smtp_password"):
        doc["smtp_password"] = "***"
    return doc


@router.put("/settings/notifications")
async def update_notif(payload: SmtpSettingsIn, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    db = get_db()
    data = payload.model_dump()
    if data.get("smtp_password") in ("***", ""):
        existing = await db.notification_settings.find_one({"id": NOTIF_ID}) or {}
        data["smtp_password"] = existing.get("smtp_password", "")
    await db.notification_settings.update_one(
        {"id": NOTIF_ID},
        {"$set": {**data, "updated_at": now_iso()}},
        upsert=True,
    )
    doc = await db.notification_settings.find_one({"id": NOTIF_ID}, {"_id": 0})
    if doc and doc.get("smtp_password"):
        doc["smtp_password"] = "***"
    return doc


class TestEmailIn(BaseModel):
    to: str


@router.post("/settings/notifications/test")
async def test_email(payload: TestEmailIn, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    from notifications import send_email
    ok = await send_email(
        [payload.to],
        "[Procura] Test Email",
        "<p>Test dari Procura E-Procurement. Jika Anda menerima ini, konfigurasi SMTP sudah benar.</p>",
    )
    return {"ok": ok, "message": "Email terkirim" if ok else "Gagal / SMTP belum enabled. Cek log backend."}
