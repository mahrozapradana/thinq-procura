"""Lot barcode label printing + Warehouse stock aggregation + BC audit trail."""
from __future__ import annotations

import io
from datetime import datetime
from typing import Optional

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from auth_utils import get_current_active_user
from db_models import get_db, now_iso

router = APIRouter(prefix="/api")


def _qr_image(text: str, size_cm: float = 2.5):
    img = qrcode.make(text)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return RLImage(buf, width=size_cm * cm, height=size_cm * cm)


@router.get("/goods-receipts/{rid}/labels.pdf")
async def receipt_labels_pdf(rid: str, user=Depends(get_current_active_user)):
    db = get_db()
    r = await db.goods_receipts.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Not found")
    bc = None
    if r.get("customs_doc_id"):
        bc = await db.customs_docs.find_one({"id": r["customs_doc_id"]}, {"_id": 0})
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1*cm, rightMargin=1*cm, topMargin=1*cm, bottomMargin=1*cm)
    styles = getSampleStyleSheet()
    lbl = ParagraphStyle("l", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#64748B"))
    val = ParagraphStyle("v", parent=styles["Normal"], fontSize=10)
    big = ParagraphStyle("b", parent=styles["Normal"], fontSize=12, textColor=colors.HexColor("#0F172A"))
    story = []
    labels = []
    for it in r.get("items", []):
        lots = it.get("lots") or ([{"lot_number": it.get("lot_number"), "qty": it.get("qty_received")}] if it.get("lot_number") else [])
        if not lots:
            lots = [{"lot_number": "-", "qty": it.get("qty_received")}]
        for lot in lots:
            payload = f"GR:{r.get('receipt_number')}|LOT:{lot.get('lot_number')}|BC:{bc.get('doc_number') if bc else '-'}"
            qr = _qr_image(payload, 2.6)
            info = [
                [Paragraph(f"<b>{it.get('product_name') or ''}</b>", big)],
                [Paragraph(f"GR: {r.get('receipt_number')}", val)],
                [Paragraph(f"LOT: <b>{lot.get('lot_number') or '-'}</b>", val)],
                [Paragraph(f"QTY: <b>{lot.get('qty') or ''}</b>", val)],
                [Paragraph(f"BC: {bc.get('bc_type')+' '+bc.get('doc_number') if bc else 'Non-Bonded'}", lbl)],
            ]
            it_tbl = Table(info, colWidths=[7*cm])
            it_tbl.setStyle(TableStyle([("BOTTOMPADDING",(0,0),(-1,-1),1)]))
            row = Table([[qr, it_tbl]], colWidths=[3*cm, 7.5*cm])
            row.setStyle(TableStyle([("BOX",(0,0),(-1,-1),0.6,colors.HexColor("#0F172A")),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6)]))
            labels.append(row)
    # 2 columns per row
    grid_rows = []
    for i in range(0, len(labels), 2):
        pair = labels[i:i+2]
        while len(pair) < 2:
            pair.append(Paragraph("", val))
        grid_rows.append(pair)
    if grid_rows:
        grid = Table(grid_rows, colWidths=[10.5*cm, 10.5*cm])
        grid.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("BOTTOMPADDING",(0,0),(-1,-1),8)]))
        story.append(grid)
    else:
        story.append(Paragraph("Belum ada lot pada receipt ini.", val))
    pdf.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="labels_{r.get("receipt_number")}.pdf"'})


# ---------- Warehouse stock aggregation ----------
@router.get("/warehouse-stock")
async def warehouse_stock(warehouse_id: Optional[str] = None, is_bonded: Optional[bool] = None, q: Optional[str] = None, user=Depends(get_current_active_user)):
    db = get_db()
    warehouses = {w["id"]: w for w in await db.warehouses.find({}, {"_id": 0}).to_list(500)}
    locations = {l["id"]: l for l in await db.locations.find({}, {"_id": 0}).to_list(1000)}
    products = {p["id"]: p for p in await db.products.find({}, {"_id": 0}).to_list(2000)}
    receipts = await db.goods_receipts.find({}, {"_id": 0}).to_list(5000)
    returns_ = await db.goods_returns.find({}, {"_id": 0}).to_list(5000)
    # Aggregate: {(warehouse_id, location_id, product_id, lot_number): qty}
    stock: dict = {}
    for r in receipts:
        wh = r.get("warehouse_id")
        loc = r.get("location_id")
        for it in r.get("items", []):
            lots = it.get("lots") or []
            if not lots and it.get("lot_number"):
                lots = [{"lot_number": it.get("lot_number"), "qty": it.get("qty_received")}]
            if not lots:
                lots = [{"lot_number": None, "qty": it.get("qty_received")}]
            for lot in lots:
                k = (wh, loc, it.get("product_id"), lot.get("lot_number"))
                stock[k] = stock.get(k, 0) + float(lot.get("qty") or 0)
    for rr in returns_:
        # returns decrease stock; use receipt info to determine wh/loc
        rec = next((x for x in receipts if x.get("id") == rr.get("receipt_id")), None) if rr.get("receipt_id") else None
        wh = (rec or {}).get("warehouse_id")
        loc = (rec or {}).get("location_id")
        for it in rr.get("items", []):
            k = (wh, loc, it.get("product_id"), None)
            stock[k] = stock.get(k, 0) - float(it.get("qty") or 0)
    rows = []
    for (wh, loc, pid, lot), qty in stock.items():
        if qty <= 0:
            continue
        w = warehouses.get(wh) or {}
        l = locations.get(loc) or {}
        p = products.get(pid) or {}
        if warehouse_id and wh != warehouse_id:
            continue
        if is_bonded is not None and bool(w.get("is_bonded")) != is_bonded:
            continue
        if q:
            s = q.lower()
            if not any(s in str(v or "").lower() for v in [w.get("name"), l.get("name"), p.get("name"), p.get("code"), lot]):
                continue
        rows.append({
            "warehouse_id": wh, "warehouse_name": w.get("name") or "-", "warehouse_bonded": bool(w.get("is_bonded")),
            "location_id": loc, "location_name": l.get("name") or "-", "location_bonded": bool(l.get("is_bonded_zone")),
            "product_id": pid, "product_code": p.get("code"), "product_name": p.get("name"),
            "unit": p.get("unit"), "lot_number": lot, "qty": qty,
        })
    rows.sort(key=lambda x: (x["warehouse_name"], x["product_name"] or "", x["lot_number"] or ""))
    return rows


# ---------- BC Audit / Versioning ----------
@router.get("/customs-docs/{cid}/history")
async def bc_history(cid: str, user=Depends(get_current_active_user)):
    db = get_db()
    return await db.bc_audit.find({"doc_id": cid}, {"_id": 0}).sort("at", -1).to_list(500)
