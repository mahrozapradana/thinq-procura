"""Master data routes: departments, categories, products, hs_codes, vendors, users."""
from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from auth_utils import get_current_active_user, hash_password
from db_models import get_db, new_id, now_iso, clean

router = APIRouter(prefix="/api")


# ---------- Models ----------
class DepartmentIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    code: str
    manager_name: Optional[str] = None


class CategoryIn(BaseModel):
    name: str
    code: str
    description: Optional[str] = None


class HSCodeIn(BaseModel):
    code: str
    description: str
    duty_rate: float = 0.0


class ProductIn(BaseModel):
    code: str
    name: str
    category_id: Optional[str] = None
    unit: str = "PCS"
    hs_code_id: Optional[str] = None
    default_price: float = 0.0
    description: Optional[str] = None


class VendorApproveIn(BaseModel):
    default_password: str = "vendor123"


class UserIn(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: str = "requester"
    department_id: Optional[str] = None
    approval_limit: float = 0.0


# ---------- Departments ----------
@router.get("/departments")
async def list_departments(user=Depends(get_current_active_user)):
    db = get_db()
    return await db.departments.find({}, {"_id": 0}).to_list(1000)


@router.post("/departments")
async def create_department(payload: DepartmentIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    doc = {"id": new_id(), "created_at": now_iso(), **payload.model_dump()}
    await db.departments.insert_one(doc)
    return clean(doc)


@router.put("/departments/{dept_id}")
async def update_department(dept_id: str, payload: DepartmentIn, user=Depends(get_current_active_user)):
    db = get_db()
    await db.departments.update_one({"id": dept_id}, {"$set": payload.model_dump()})
    doc = await db.departments.find_one({"id": dept_id}, {"_id": 0})
    return doc


@router.delete("/departments/{dept_id}")
async def delete_department(dept_id: str, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Not allowed")
    db = get_db()
    await db.departments.delete_one({"id": dept_id})
    return {"ok": True}


# ---------- Categories ----------
@router.get("/categories")
async def list_categories(user=Depends(get_current_active_user)):
    db = get_db()
    return await db.categories.find({}, {"_id": 0}).to_list(1000)


@router.post("/categories")
async def create_category(payload: CategoryIn, user=Depends(get_current_active_user)):
    db = get_db()
    doc = {"id": new_id(), "created_at": now_iso(), **payload.model_dump()}
    await db.categories.insert_one(doc)
    return clean(doc)


@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, user=Depends(get_current_active_user)):
    db = get_db()
    await db.categories.delete_one({"id": cat_id})
    return {"ok": True}


# ---------- HS Codes ----------
@router.get("/hs-codes")
async def list_hs(user=Depends(get_current_active_user)):
    db = get_db()
    return await db.hs_codes.find({}, {"_id": 0}).to_list(1000)


@router.post("/hs-codes")
async def create_hs(payload: HSCodeIn, user=Depends(get_current_active_user)):
    db = get_db()
    doc = {"id": new_id(), "created_at": now_iso(), **payload.model_dump()}
    await db.hs_codes.insert_one(doc)
    return clean(doc)


@router.delete("/hs-codes/{hs_id}")
async def delete_hs(hs_id: str, user=Depends(get_current_active_user)):
    db = get_db()
    await db.hs_codes.delete_one({"id": hs_id})
    return {"ok": True}


# ---------- Products ----------
@router.get("/products")
async def list_products(user=Depends(get_current_active_user)):
    db = get_db()
    return await db.products.find({}, {"_id": 0}).to_list(1000)


@router.post("/products")
async def create_product(payload: ProductIn, user=Depends(get_current_active_user)):
    db = get_db()
    doc = {"id": new_id(), "created_at": now_iso(), **payload.model_dump()}
    await db.products.insert_one(doc)
    return clean(doc)


@router.put("/products/{pid}")
async def update_product(pid: str, payload: ProductIn, user=Depends(get_current_active_user)):
    db = get_db()
    await db.products.update_one({"id": pid}, {"$set": payload.model_dump()})
    return await db.products.find_one({"id": pid}, {"_id": 0})


@router.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(get_current_active_user)):
    db = get_db()
    await db.products.delete_one({"id": pid})
    return {"ok": True}


# ---------- Vendors mgmt (procurement side) ----------
@router.get("/vendors")
async def list_vendors(status: Optional[str] = None, exclude_blacklisted: bool = False, user=Depends(get_current_active_user)):
    db = get_db()
    q: dict = {}
    if status:
        q["status"] = status
    if exclude_blacklisted:
        q["$and"] = [
            {"blacklisted": {"$ne": True}},
            {"$or": [
                {"avg_rating": {"$exists": False}},
                {"avg_rating": {"$gte": 2}},
                {"ratings_count": {"$lt": 2}},
            ]},
        ]
    return await db.vendors.find(q, {"_id": 0}).to_list(1000)


@router.get("/vendors/{vid}")
async def get_vendor(vid: str, user=Depends(get_current_active_user)):
    db = get_db()
    v = await db.vendors.find_one({"id": vid}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Vendor not found")
    return v


@router.post("/vendors/{vid}/approve")
async def approve_vendor(vid: str, payload: VendorApproveIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    v = await db.vendors.find_one({"id": vid})
    if not v:
        raise HTTPException(404, "Vendor not found")
    # Create vendor user account if not exists
    existing = await db.users.find_one({"email": v["email"]})
    user_id = existing["id"] if existing else new_id()
    if not existing:
        await db.users.insert_one({
            "id": user_id,
            "email": v["email"],
            "password_hash": hash_password(payload.default_password),
            "name": v.get("company_name") or v.get("name"),
            "role": "vendor",
            "status": "active",
            "vendor_id": vid,
            "created_at": now_iso(),
        })
    await db.vendors.update_one(
        {"id": vid},
        {"$set": {"status": "approved", "approved_at": now_iso(), "user_id": user_id}},
    )
    return {"ok": True, "user_id": user_id, "default_password": payload.default_password if not existing else None}


@router.post("/vendors/{vid}/reject")
async def reject_vendor(vid: str, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    await db.vendors.update_one({"id": vid}, {"$set": {"status": "rejected"}})
    return {"ok": True}


# ---------- Users mgmt ----------
@router.get("/users")
async def list_users(user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Not allowed")
    db = get_db()
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)


@router.post("/users")
async def create_user(payload: UserIn, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Not allowed")
    db = get_db()
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already exists")
    doc = {
        "id": new_id(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "department_id": payload.department_id,
        "approval_limit": payload.approval_limit,
        "status": "active",
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("password_hash", None)
    return clean(doc)


@router.delete("/users/{uid}")
async def delete_user(uid: str, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Not allowed")
    db = get_db()
    await db.users.delete_one({"id": uid})
    return {"ok": True}
