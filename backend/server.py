"""Main FastAPI entry point for e-procurement backend."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from starlette.middleware.cors import CORSMiddleware

from auth_utils import (
    create_access_token,
    create_refresh_token,
    get_current_active_user,
    hash_password,
    verify_password,
)
from db_models import get_db, new_id, now_iso, clean
from routes_masters import router as masters_router
from routes_procurement import router as procurement_router
from routes_inventory import router as inventory_router
from routes_vendor_portal import router as vendor_router
from routes_settings import router as settings_router
from routes_reports import router as reports_router
from routes_uploads import router as uploads_router
from routes_cron import router as cron_router
from routes_extended import router as extended_router
from routes_po_extras import router as po_extras_router
from routes_analytics import router as analytics_router
from routes_customs import router as customs_router
from routes_stock import router as stock_router
from routes_taxes import router as taxes_router
from routes_tax_reports import router as tax_reports_router
from routes_spt import router as spt_router
from routes_notifications import router as notif_router
from routes_vendor_suggest import router as vsuggest_router
from routes_fx import router as fx_router
from routes_digest import router as digest_router
from routes_dns_wizard import router as dns_wizard_router
from routes_invoice_extras import router as invoice_extras_router
from routes_ab_analytics import router as ab_router
from routes_import import router as import_router


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("epr")

ASCENDING = 1
DESCENDING = -1


INDEX_SPECS = {
    "users": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("email", ASCENDING)], "unique": True},
        {"keys": [("role", ASCENDING), ("status", ASCENDING)]},
        {"keys": [("vendor_id", ASCENDING), ("role", ASCENDING)]},
    ],
    "vendors": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("email", ASCENDING)]},
        {"keys": [("code", ASCENDING)]},
        {"keys": [("status", ASCENDING)]},
        {"keys": [("is_blacklisted", ASCENDING), ("status", ASCENDING)]},
    ],
    "departments": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("name", ASCENDING)]},
    ],
    "categories": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("name", ASCENDING)]},
    ],
    "hs_codes": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("code", ASCENDING)]},
    ],
    "products": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("code", ASCENDING)]},
        {"keys": [("category_id", ASCENDING)]},
    ],
    "vendor_pricelists": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("vendor_id", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("product_id", ASCENDING), ("verified", DESCENDING), ("price", ASCENDING)]},
    ],
    "approval_workflows": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("applies_to", ASCENDING), ("department_id", ASCENDING)]},
    ],
    "budgets": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("status", ASCENDING)]},
        {"keys": [("period", ASCENDING), ("department_id", ASCENDING), ("product_id", ASCENDING)]},
        {"keys": [("created_at", DESCENDING)]},
    ],
    "prs": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("pr_number", ASCENDING)], "unique": True},
        {"keys": [("requester_id", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("department_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("preferred_vendor_id", ASCENDING)]},
        {"keys": [("created_at", DESCENDING)]},
    ],
    "pos": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("po_number", ASCENDING)], "unique": True},
        {"keys": [("vendor_id", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("status", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("po_type", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("assigned_pic_id", ASCENDING), ("status", ASCENDING)]},
        {"keys": [("shipping_status", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("invoice_status", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("created_by", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("created_at", DESCENDING)]},
    ],
    "tenders": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("tender_number", ASCENDING)], "unique": True},
        {"keys": [("status", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("deadline", ASCENDING), ("status", ASCENDING)]},
        {"keys": [("awarded_vendor_id", ASCENDING)]},
    ],
    "goods_receipts": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("receipt_number", ASCENDING)], "unique": True},
        {"keys": [("po_id", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("customs_doc_id", ASCENDING)]},
        {"keys": [("warehouse_id", ASCENDING), ("location_id", ASCENDING)]},
        {"keys": [("created_at", DESCENDING)]},
    ],
    "goods_returns": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("return_number", ASCENDING)], "unique": True},
        {"keys": [("receipt_id", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("created_at", DESCENDING)]},
    ],
    "warehouses": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("is_bonded", ASCENDING)]},
    ],
    "locations": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("warehouse_id", ASCENDING)]},
        {"keys": [("is_bonded_zone", ASCENDING)]},
    ],
    "customs_docs": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("doc_number", ASCENDING)]},
        {"keys": [("status", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("po_id", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("vendor_id", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("created_at", DESCENDING)]},
    ],
    "bc_audit": [
        {"keys": [("customs_doc_id", ASCENDING), ("created_at", DESCENDING)]},
    ],
    "taxes": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("code", ASCENDING)], "unique": True},
        {"keys": [("tax_type", ASCENDING)]},
    ],
    "notifications": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("user_id", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("user_id", ASCENDING), ("is_read", ASCENDING)]},
        {"keys": [("type", ASCENDING), ("created_at", DESCENDING)]},
    ],
    "po_messages": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("po_id", ASCENDING), ("created_at", ASCENDING)]},
        {"keys": [("sender_id", ASCENDING), ("created_at", DESCENDING)]},
    ],
    "shipments": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("shipment_number", ASCENDING)], "unique": True},
        {"keys": [("po_id", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("vendor_id", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("status", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("tracking_number", ASCENDING)]},
    ],
    "invoices": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("invoice_number", ASCENDING)], "unique": True},
        {"keys": [("po_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("vendor_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("status", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("due_date", ASCENDING), ("status", ASCENDING)]},
        {"keys": [("created_at", DESCENDING)]},
    ],
    "ls_documents": [
        {"keys": [("id", ASCENDING)], "unique": True},
        {"keys": [("vendor_id", ASCENDING), ("created_at", DESCENDING)]},
        {"keys": [("po_id", ASCENDING)]},
        {"keys": [("reference_number", ASCENDING)]},
        {"keys": [("status", ASCENDING), ("created_at", DESCENDING)]},
    ],
    "company_settings": [
        {"keys": [("id", ASCENDING)], "unique": True},
    ],
    "odoo_settings": [
        {"keys": [("id", ASCENDING)], "unique": True},
    ],
    "notification_settings": [
        {"keys": [("id", ASCENDING)], "unique": True},
    ],
}


async def ensure_indexes(db):
    for collection_name, specs in INDEX_SPECS.items():
        collection = db[collection_name]
        for spec in specs:
            await collection.create_index(spec["keys"], unique=spec.get("unique", False))


app = FastAPI(title="E-Procurement API")

api_router = APIRouter(prefix="/api")


# ---------- Auth ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RegisterIn(BaseModel):
    email: EmailStr
    name: str
    password: str


def _set_cookies(response: Response, access: str, refresh: str):
    response.set_cookie(
        key="access_token",
        value=access,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 12,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


@api_router.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    db = get_db()
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Email atau password salah")
    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    if user.get("status") not in (None, "active"):
        raise HTTPException(status_code=403, detail="Akun belum aktif atau ditolak")
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_cookies(response, access, refresh)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "access_token": access}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user=Depends(get_current_active_user)):
    return user


@api_router.get("/")
async def root():
    return {"name": "E-Procurement API", "version": "1.0"}


app.include_router(api_router)
app.include_router(masters_router)
app.include_router(procurement_router)
app.include_router(inventory_router)
app.include_router(vendor_router)
app.include_router(settings_router)
app.include_router(reports_router)
app.include_router(uploads_router)
app.include_router(cron_router)
app.include_router(extended_router)
app.include_router(po_extras_router)
app.include_router(analytics_router)
app.include_router(customs_router)
app.include_router(stock_router)
app.include_router(taxes_router)
app.include_router(tax_reports_router)
app.include_router(spt_router)
app.include_router(notif_router)
app.include_router(vsuggest_router)
app.include_router(fx_router)
app.include_router(digest_router)
app.include_router(dns_wizard_router)
app.include_router(ab_router)
app.include_router(import_router)
app.include_router(invoice_extras_router)


# ---------- CORS ----------
_frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
_origins = [_frontend_url, "http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_origins,
    allow_origin_regex=r"https://.*\.preview\.emergentagent\.com",
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Startup: seed admin, indexes, default workflow ----------
@app.on_event("startup")
async def startup_seed():
    db = get_db()
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Owner Admin",
            "role": "admin",
            "status": "active",
            "approval_limit": 999_999_999_999,
            "created_at": now_iso(),
        })
        logger.info(f"Admin seeded: {admin_email}")
    else:
        # keep password in sync with env
        if not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"password_hash": hash_password(admin_password)}},
            )
    await ensure_indexes(db)
    # Seed default company settings if missing
    if not await db.company_settings.find_one({"id": "singleton-company"}):
        await db.company_settings.insert_one({
            "id": "singleton-company",
            "name": "PT Sample Kawasan Berikat",
            "is_bonded_zone": True,
            "currency": "IDR",
            "created_at": now_iso(),
        })
    # Seed a default multi-level PR approval workflow if none exists
    if not await db.approval_workflows.find_one({"applies_to": "PR"}):
        await db.approval_workflows.insert_one({
            "id": new_id(),
            "name": "Default PR Approval",
            "applies_to": "PR",
            "department_id": None,
            "levels": [
                {"level": 1, "role": "approver", "min_amount": 0, "max_amount": 999_999_999_999},
                {"level": 2, "role": "procurement", "min_amount": 10_000_000, "max_amount": 999_999_999_999},
                {"level": 3, "role": "admin", "min_amount": 100_000_000, "max_amount": 999_999_999_999},
            ],
            "created_at": now_iso(),
        })
    if not await db.approval_workflows.find_one({"applies_to": "PO"}):
        await db.approval_workflows.insert_one({
            "id": new_id(),
            "name": "Default PO Approval",
            "applies_to": "PO",
            "department_id": None,
            "levels": [
                {"level": 1, "role": "procurement", "min_amount": 0, "max_amount": 999_999_999_999},
                {"level": 2, "role": "admin", "min_amount": 50_000_000, "max_amount": 999_999_999_999},
            ],
            "created_at": now_iso(),
        })
    if not await db.approval_workflows.find_one({"applies_to": "BUDGET"}):
        await db.approval_workflows.insert_one({
            "id": new_id(),
            "name": "Default Budget Approval",
            "applies_to": "BUDGET",
            "department_id": None,
            "levels": [
                {"level": 1, "role": "admin", "min_amount": 0, "max_amount": 999_999_999_999},
            ],
            "created_at": now_iso(),
        })


@app.on_event("shutdown")
async def shutdown():
    logger.info("Shutting down")
