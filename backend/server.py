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


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("epr")


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
    await db.users.create_index("email", unique=True)
    await db.vendors.create_index("email")
    await db.prs.create_index("pr_number")
    await db.pos.create_index("po_number")
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
