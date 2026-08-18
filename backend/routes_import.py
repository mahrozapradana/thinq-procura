"""Bulk import CSV for products, vendors, PRs."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth_utils import get_current_active_user
from db_models import get_db, new_id, now_iso

router = APIRouter(prefix="/api/import")


def _require_admin(user: dict):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Admin only")


@router.post("/products.csv")
async def import_products(file: UploadFile = File(...), user=Depends(get_current_active_user)):
    """CSV columns: code,name,category_id,uom,hs_code,description"""
    _require_admin(user)
    content = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))
    db = get_db()
    ok, fail, errors = 0, 0, []
    for i, row in enumerate(reader, start=2):
        try:
            if not row.get("code") or not row.get("name"):
                raise ValueError("code & name wajib")
            if await db.products.find_one({"code": row["code"]}):
                fail += 1; errors.append(f"L{i}: kode {row['code']} sudah ada"); continue
            doc = {"id": new_id(), "created_at": now_iso(), **{k: v for k, v in row.items() if v}}
            await db.products.insert_one(doc)
            ok += 1
        except Exception as e:
            fail += 1
            errors.append(f"L{i}: {e}")
    return {"ok": ok, "failed": fail, "errors": errors[:20]}


@router.post("/vendors.csv")
async def import_vendors(file: UploadFile = File(...), user=Depends(get_current_active_user)):
    """CSV columns: company_name,email,phone,npwp,address,pic_name,pic_email"""
    _require_admin(user)
    content = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))
    db = get_db()
    ok, fail, errors = 0, 0, []
    for i, row in enumerate(reader, start=2):
        try:
            if not row.get("company_name") or not row.get("email"):
                raise ValueError("company_name & email wajib")
            doc = {
                "id": new_id(),
                "created_at": now_iso(),
                "status": "approved",
                "avg_rating": 0,
                "is_blacklisted": False,
                **{k: v for k, v in row.items() if v},
            }
            await db.vendors.insert_one(doc)
            ok += 1
        except Exception as e:
            fail += 1
            errors.append(f"L{i}: {e}")
    return {"ok": ok, "failed": fail, "errors": errors[:20]}
