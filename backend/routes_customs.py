"""Customs (BC) documents, warehouses & locations for bonded/non-bonded receiving."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_active_user
from db_models import get_db, new_id, now_iso, clean, gen_number

router = APIRouter(prefix="/api")


BC_TYPES = ["BC 2.0", "BC 2.3", "BC 2.6.2", "BC 2.7", "BC 4.0"]


# ---------- Warehouses ----------
class WarehouseIn(BaseModel):
    name: str
    code: str
    is_bonded: bool = False
    address: Optional[str] = None


@router.get("/warehouses")
async def list_wh(user=Depends(get_current_active_user)):
    return await get_db().warehouses.find({}, {"_id": 0}).to_list(500)


@router.post("/warehouses")
async def create_wh(payload: WarehouseIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement", "warehouse"):
        raise HTTPException(403, "Not allowed")
    db = get_db()
    doc = {"id": new_id(), "created_at": now_iso(), **payload.model_dump()}
    await db.warehouses.insert_one(doc)
    return clean(doc)


@router.delete("/warehouses/{wid}")
async def del_wh(wid: str, user=Depends(get_current_active_user)):
    await get_db().warehouses.delete_one({"id": wid}); return {"ok": True}


# ---------- Locations ----------
class LocationIn(BaseModel):
    warehouse_id: str
    name: str
    code: str
    is_bonded_zone: bool = False


@router.get("/locations")
async def list_loc(warehouse_id: Optional[str] = None, user=Depends(get_current_active_user)):
    q = {"warehouse_id": warehouse_id} if warehouse_id else {}
    return await get_db().locations.find(q, {"_id": 0}).to_list(1000)


@router.post("/locations")
async def create_loc(payload: LocationIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement", "warehouse"):
        raise HTTPException(403, "Not allowed")
    doc = {"id": new_id(), "created_at": now_iso(), **payload.model_dump()}
    await get_db().locations.insert_one(doc); return clean(doc)


@router.delete("/locations/{lid}")
async def del_loc(lid: str, user=Depends(get_current_active_user)):
    await get_db().locations.delete_one({"id": lid}); return {"ok": True}


# ---------- Customs (BC) Documents ----------
class CustomsDocIn(BaseModel):
    bc_type: str  # BC 2.0 | BC 2.3 | BC 2.6.2 | BC 2.7 | BC 4.0
    po_id: Optional[str] = None
    # Header
    car: Optional[str] = None
    register_no: Optional[str] = None
    register_date: Optional[str] = None
    kantor_pengawas: Optional[str] = None
    kantor_bongkar: Optional[str] = None
    bl_no: Optional[str] = None
    bl_date: Optional[str] = None
    pel_bongkar: Optional[str] = None
    pel_muat: Optional[str] = None
    pel_transit: Optional[str] = None
    tujuan_tpb: Optional[str] = None
    tempat_penimbunan: Optional[str] = None
    from_kb_pjt: Optional[str] = None
    cara_pengangkutan: Optional[str] = None
    sarana_pengangkut: Optional[str] = None
    voy_flight: Optional[str] = None
    kode_bendera: Optional[str] = None
    tanggal_tiba: Optional[str] = None
    tutup_pu: Optional[str] = None
    nomor_bc11: Optional[str] = None
    tanggal_bc11: Optional[str] = None
    nomor_pos: Optional[str] = None
    sub_pos: Optional[str] = None
    supplier: Optional[str] = None
    shipper: Optional[str] = None
    owner: Optional[str] = None
    currency: str = "USD"
    rate: float = 0
    price_type: Optional[str] = None
    value: float = 0
    value_added: float = 0
    discount: float = 0
    freight: float = 0
    insurance_type: Optional[str] = None
    insurance_value: float = 0
    kena_pajak: Optional[str] = None
    bruto: float = 0
    nama_penanda_tangan: Optional[str] = None
    jabatan_penanda_tangan: Optional[str] = None
    # Detail items
    items: List[dict] = []       # {seri, kode_barang, product_id, hs_code, kategori, qty, unit, unit_price, ...}
    # Documents (RKSP, B/L, PL, Invoice, etc)
    documents: List[dict] = []    # {tipe_dok, uraian_fasilitas, uraian_dokumen, nomor_dokumen, tanggal_dokumen, memo}
    # Petikemas
    petikemas: List[dict] = []    # {seri, jenis, tipe, ukuran, nomor, note}
    notes: Optional[str] = None


@router.get("/customs-docs")
async def list_customs(bc_type: Optional[str] = None, q: Optional[str] = None, page: int = 1, page_size: int = 20, user=Depends(get_current_active_user)):
    db = get_db()
    query: dict = {}
    if bc_type:
        query["bc_type"] = bc_type
    if q:
        query["$or"] = [
            {"register_no": {"$regex": q, "$options": "i"}},
            {"bl_no": {"$regex": q, "$options": "i"}},
            {"car": {"$regex": q, "$options": "i"}},
        ]
    total = await db.customs_docs.count_documents(query)
    page = max(page, 1); page_size = min(max(page_size, 1), 100)
    items = await db.customs_docs.find(query, {"_id": 0}).sort("created_at", -1).skip((page-1)*page_size).limit(page_size).to_list(page_size)
    return {"items": items, "total": total, "page": page, "pages": (total + page_size - 1)//page_size, "page_size": page_size}


@router.get("/customs-docs/{cid}")
async def get_customs(cid: str, user=Depends(get_current_active_user)):
    doc = await get_db().customs_docs.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@router.post("/customs-docs")
async def create_customs(payload: CustomsDocIn, user=Depends(get_current_active_user)):
    if user["role"] not in ("admin", "procurement", "warehouse"):
        raise HTTPException(403, "Not allowed")
    if payload.bc_type not in BC_TYPES:
        raise HTTPException(400, f"bc_type harus salah satu dari: {BC_TYPES}")
    db = get_db()
    doc = {
        "id": new_id(),
        "doc_number": gen_number(payload.bc_type.replace(" ", "").replace(".", "-")),
        "status": "draft",
        "created_by": user["id"],
        "created_by_name": user["name"],
        "created_at": now_iso(),
        **payload.model_dump(),
    }
    await db.customs_docs.insert_one(doc)
    return clean(doc)


@router.put("/customs-docs/{cid}")
async def update_customs(cid: str, payload: CustomsDocIn, user=Depends(get_current_active_user)):
    db = get_db()
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.customs_docs.update_one({"id": cid}, {"$set": {**data, "updated_at": now_iso()}})
    return await db.customs_docs.find_one({"id": cid}, {"_id": 0})


@router.post("/customs-docs/{cid}/submit")
async def submit_customs(cid: str, user=Depends(get_current_active_user)):
    await get_db().customs_docs.update_one({"id": cid}, {"$set": {"status": "submitted", "submitted_at": now_iso()}})
    return {"ok": True}


@router.delete("/customs-docs/{cid}")
async def del_customs(cid: str, user=Depends(get_current_active_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    await get_db().customs_docs.delete_one({"id": cid}); return {"ok": True}


# ---------- Create BC draft directly from a Bonded PO ----------
@router.post("/pos/{po_id}/create-customs/{bc_type_key}")
async def customs_from_po(po_id: str, bc_type_key: str, user=Depends(get_current_active_user)):
    """bc_type_key: bc20 | bc23 | bc262 | bc27 | bc40"""
    key_map = {"bc20": "BC 2.0", "bc23": "BC 2.3", "bc262": "BC 2.6.2", "bc27": "BC 2.7", "bc40": "BC 4.0"}
    if bc_type_key not in key_map:
        raise HTTPException(400, "bc_type_key tidak dikenal")
    db = get_db()
    po = await db.pos.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO not found")
    if po.get("po_type") != "BONDED":
        raise HTTPException(400, "Hanya PO Bonded yang dapat membuat dokumen kepabeanan")
    vendor = await db.vendors.find_one({"id": po["vendor_id"]}, {"_id": 0}) or {}
    hs_map = {h["id"]: h.get("code") for h in await db.hs_codes.find({}, {"_id": 0}).to_list(1000)}
    prod_map = {p["id"]: p for p in await db.products.find({}, {"_id": 0}).to_list(2000)}
    items = []
    for i, it in enumerate(po.get("items", []), 1):
        p = prod_map.get(it.get("product_id")) or {}
        items.append({
            "seri": i,
            "kode_barang": p.get("code") or "",
            "product_id": it.get("product_id"),
            "deskripsi": p.get("name"),
            "hs_code": hs_map.get(p.get("hs_code_id")) or "",
            "kategori": "BARANG UNTUK DITIMBUN",
            "qty": it.get("qty"),
            "unit": p.get("unit") or "PCS",
            "unit_price": it.get("price"),
            "amount": it.get("subtotal"),
        })
    doc = {
        "id": new_id(),
        "doc_number": gen_number(key_map[bc_type_key].replace(" ", "").replace(".", "-")),
        "status": "draft",
        "bc_type": key_map[bc_type_key],
        "po_id": po_id,
        "supplier": vendor.get("company_name"),
        "shipper": vendor.get("company_name"),
        "tujuan_tpb": "KAWASAN BERIKAT",
        "currency": po.get("currency", "IDR"),
        "value": po.get("total"),
        "items": items,
        "documents": [],
        "petikemas": [],
        "created_by": user["id"],
        "created_by_name": user["name"],
        "created_at": now_iso(),
    }
    await db.customs_docs.insert_one(doc)
    return clean(doc)
