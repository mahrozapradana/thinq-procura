"""PO Print PDF + PO Chat messages + Vendor PIC login provisioning."""
from __future__ import annotations

import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
import requests as _rq

from auth_utils import get_current_active_user, hash_password
from db_models import get_db, new_id, now_iso

router = APIRouter(prefix="/api")


def _fmt(n):
    try:
        return f"Rp {float(n):,.0f}".replace(",", ".")
    except Exception:
        return str(n)


@router.get("/pos/{po_id}/print.pdf")
async def po_print_pdf(po_id: str, user=Depends(get_current_active_user)):
    db = get_db()
    po = await db.pos.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO not found")
    vendor = await db.vendors.find_one({"id": po["vendor_id"]}, {"_id": 0}) or {}
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.2*cm, rightMargin=1.2*cm, topMargin=1.2*cm, bottomMargin=1.2*cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("t", parent=styles["Title"], fontSize=16, textColor=colors.HexColor("#0F172A"))
    label_style = ParagraphStyle("lb", parent=styles["Normal"], textColor=colors.HexColor("#94A3B8"), fontSize=8)
    val_style = ParagraphStyle("v", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#0F172A"))
    story = []
    company = await db.company_settings.find_one({"id": "singleton-company"}, {"_id": 0}) or {}
    if company.get("logo_url"):
        try:
            r = _rq.get(company["logo_url"], timeout=10)
            if r.ok:
                logo_buf = io.BytesIO(r.content)
                logo = RLImage(logo_buf, width=3*cm, height=1.5*cm, kind="proportional")
                story.append(logo)
                story.append(Spacer(1, 6))
        except Exception:
            pass
    if company.get("name"):
        story.append(Paragraph(f"<b>{company['name']}</b>", val_style))
        story.append(Spacer(1, 4))
    story.append(Paragraph(f"#{po.get('po_number')}", title_style))
    story.append(Spacer(1, 8))
    header = [
        [Paragraph("Vendor", label_style), Paragraph(vendor.get("company_name") or "-", val_style),
         Paragraph("Order Date", label_style), Paragraph((po.get("order_date") or "-")[:10], val_style)],
        [Paragraph("Vendor Code", label_style), Paragraph(po.get("vendor_code") or "-", val_style),
         Paragraph("Receipt Date", label_style), Paragraph((po.get("receipt_date") or "-")[:10], val_style)],
        [Paragraph("Warehouse", label_style), Paragraph(po.get("warehouse") or "-", val_style),
         Paragraph("Vendor Forecast", label_style), Paragraph(po.get("vendor_forecast") or "-", val_style)],
        [Paragraph("Payment Terms", label_style), Paragraph(po.get("payment_terms") or "-", val_style),
         Paragraph("Projects", label_style), Paragraph(", ".join(po.get("projects") or []) or "-", val_style)],
    ]
    ht = Table(header, colWidths=[3*cm, 6*cm, 3*cm, 5*cm])
    ht.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("BOTTOMPADDING", (0,0), (-1,-1), 4)]))
    story.append(ht)
    story.append(Spacer(1, 12))
    tax = po.get("tax_percent") or 11
    rows = [["#", "Product", "Description", "Projects", "Qty", "Unit Price", "Taxes", "Subtotal"]]
    for i, it in enumerate(po.get("items", []), start=1):
        rows.append([
            str(i), f"[{(it.get('product_id') or '')[:8]}] {it.get('product_name') or ''}",
            it.get("product_name") or "-",
            ", ".join(po.get("projects") or []),
            str(it.get("qty")), _fmt(it.get("price")), f"PPN {tax}%", _fmt(it.get("subtotal")),
        ])
    tbl = Table(rows, colWidths=[0.7*cm, 3.5*cm, 3.5*cm, 2*cm, 1.2*cm, 2.4*cm, 1.6*cm, 2.4*cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#F1F5F9")),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 8),
        ("GRID", (0,0), (-1,-1), 0.3, colors.HexColor("#E2E8F0")),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 12))
    tot_rows = [
        ["Untaxed Amount", _fmt(po.get("untaxed_amount") or po.get("total"))],
        ["DPP Nilai Lain", _fmt(po.get("dpp_nilai_lain") or 0)],
        ["Amount Tax", _fmt(po.get("amount_tax") or 0)],
        ["Amount Total", _fmt(po.get("amount_total") or po.get("total"))],
    ]
    tot = Table(tot_rows, colWidths=[4*cm, 4*cm], hAlign="RIGHT")
    tot.setStyle(TableStyle([
        ("ALIGN", (1,0), (1,-1), "RIGHT"),
        ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
        ("LINEABOVE", (0,-1), (-1,-1), 0.5, colors.black),
        ("FONTSIZE", (0,0), (-1,-1), 9),
    ]))
    story.append(tot)
    if po.get("notes"):
        story.append(Spacer(1, 12))
        story.append(Paragraph(f"<b>Terms and Conditions:</b> {po['notes']}", val_style))
    # Signature footer
    if company.get("signature_url"):
        try:
            story.append(Spacer(1, 24))
            r = _rq.get(company["signature_url"], timeout=10)
            if r.ok:
                sig_buf = io.BytesIO(r.content)
                sig = RLImage(sig_buf, width=4*cm, height=2*cm, kind="proportional")
                story.append(sig)
                story.append(Paragraph(f"<b>{company.get('signature_name') or 'Authorized Signature'}</b>", val_style))
                story.append(Paragraph(f"<font size=8 color=#94A3B8>{company.get('name') or ''}</font>", val_style))
        except Exception:
            pass
    doc.build(story)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="PO_{po.get("po_number")}.pdf"'})


# ---------- PO Chat ----------
class ChatIn(BaseModel):
    text: str


@router.get("/pos/{po_id}/messages")
async def list_po_messages(po_id: str, user=Depends(get_current_active_user)):
    db = get_db()
    po = await db.pos.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "PO not found")
    if user["role"] == "vendor" and po.get("vendor_id") != user.get("vendor_id"):
        raise HTTPException(403, "Not allowed")
    msgs = await db.po_messages.find({"po_id": po_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return msgs


@router.post("/pos/{po_id}/messages")
async def post_po_message(po_id: str, payload: ChatIn, user=Depends(get_current_active_user)):
    if not payload.text.strip():
        raise HTTPException(400, "Text kosong")
    db = get_db()
    po = await db.pos.find_one({"id": po_id})
    if not po:
        raise HTTPException(404, "PO not found")
    if user["role"] == "vendor" and po.get("vendor_id") != user.get("vendor_id"):
        raise HTTPException(403, "Not allowed")
    msg = {
        "id": new_id(),
        "po_id": po_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "user_role": user["role"],
        "side": "vendor" if user["role"] == "vendor" else "buyer",
        "text": payload.text,
        "created_at": now_iso(),
    }
    await db.po_messages.insert_one(msg)
    msg.pop("_id", None)
    # Notify counterpart via email in background
    try:
        from notifications import send_email
        recipients: list[str] = []
        if user["role"] == "vendor":
            # Notify buyer (procurement + admin) - use created_by
            buyer = await db.users.find_one({"id": po.get("created_by")}, {"email": 1})
            if buyer and buyer.get("email"):
                recipients.append(buyer["email"])
        else:
            # Notify vendor user
            vendor_user = await db.users.find_one({"vendor_id": po.get("vendor_id"), "is_pic": {"$ne": True}}, {"email": 1})
            if vendor_user and vendor_user.get("email"):
                recipients.append(vendor_user["email"])
            if po.get("assigned_pic_id"):
                pic = await db.users.find_one({"id": po["assigned_pic_id"]}, {"email": 1})
                if pic and pic.get("email"):
                    recipients.append(pic["email"])
        if recipients:
            await send_email(recipients, f"[Procura] Pesan baru di PO {po.get('po_number')}",
                f"<p><b>{user['name']}</b> ({user['role']}) mengirim pesan di PO <b>{po.get('po_number')}</b>:</p><blockquote style='border-left:3px solid #0F172A;padding:8px 12px;background:#F8FAFC'>{payload.text}</blockquote>")
    except Exception:
        pass
    return msg


# ---------- Vendor PIC Portal Login ----------
class PicLoginIn(BaseModel):
    pic_index: int
    password: str = "vendor123"


@router.post("/vendors/{vid}/pics/create-login")
async def create_pic_login(vid: str, payload: PicLoginIn, user=Depends(get_current_active_user)):
    db = get_db()
    v = await db.vendors.find_one({"id": vid})
    if not v:
        raise HTTPException(404, "Vendor not found")
    # Auth: either admin/procurement, OR the vendor owner of that vendor account
    if user["role"] not in ("admin", "procurement") and user.get("vendor_id") != vid:
        raise HTTPException(403, "Not allowed")
    pics = v.get("pics") or []
    if payload.pic_index < 0 or payload.pic_index >= len(pics):
        raise HTTPException(400, "PIC index invalid")
    pic = pics[payload.pic_index]
    if not pic.get("email"):
        raise HTTPException(400, "PIC harus punya email")
    email = pic["email"].lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        return {"ok": True, "message": "PIC sudah punya login", "user_id": existing["id"]}
    user_id = new_id()
    await db.users.insert_one({
        "id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": f"{pic.get('name')} ({v.get('company_name')})",
        "role": "vendor",
        "status": "active",
        "vendor_id": vid,
        "is_pic": True,
        "pic_role": pic.get("role"),
        "created_at": now_iso(),
    })
    # mark on PIC
    pics[payload.pic_index] = {**pic, "user_id": user_id, "login_created_at": now_iso()}
    await db.vendors.update_one({"id": vid}, {"$set": {"pics": pics}})
    return {"ok": True, "user_id": user_id, "default_password": payload.password}
