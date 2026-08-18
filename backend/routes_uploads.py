"""File upload endpoint: uploads to Supabase Storage bucket."""
from __future__ import annotations

import logging
import os
import uuid
from typing import Optional

import requests
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth_utils import get_current_active_user

router = APIRouter(prefix="/api")
logger = logging.getLogger("epr.upload")


def _supabase_conf():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_KEY", "")
    bucket = os.environ.get("SUPABASE_BUCKET", "ls-documents")
    return url, key, bucket


@router.post("/uploads/ls")
async def upload_ls_file(file: UploadFile = File(...), user=Depends(get_current_active_user)):
    url, key, bucket = _supabase_conf()
    if not url or not key:
        raise HTTPException(500, "Supabase belum dikonfigurasi. Set SUPABASE_URL & SUPABASE_KEY di backend .env.")
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(400, "Ukuran file maks 10MB")
    ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"
    if ext not in (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".doc", ".docx", ".xls", ".xlsx"):
        raise HTTPException(400, f"Ekstensi {ext} tidak diperbolehkan")
    key_path = f"{user.get('vendor_id') or user['id']}/{uuid.uuid4().hex}{ext}"
    content = await file.read()
    upload_url = f"{url}/storage/v1/object/{bucket}/{key_path}"
    r = requests.post(
        upload_url,
        data=content,
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": file.content_type or "application/octet-stream",
            "x-upsert": "true",
        },
        timeout=30,
    )
    if r.status_code >= 300:
        logger.error(f"Supabase upload failed {r.status_code}: {r.text}")
        raise HTTPException(
            status_code=424,
            detail=f"Upload ke Supabase gagal ({r.status_code}). Pastikan bucket '{bucket}' sudah ada di Supabase dashboard dengan policy INSERT untuk anon/public. Detail: {r.text[:200]}",
        )
    public_url = f"{url}/storage/v1/object/public/{bucket}/{key_path}"
    return {
        "ok": True,
        "url": public_url,
        "path": key_path,
        "filename": file.filename,
        "size": len(content),
        "content_type": file.content_type,
    }
