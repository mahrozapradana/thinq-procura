"""Iteration 10: Manual vendor create + CSV import regression."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN = {"email": "mahrozapradana46@gmail.com", "password": "admin123"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ------- Manual Vendor Create -------
def test_manual_vendor_create_success(admin_headers):
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_vendor_{suffix}@example.com"
    payload = {
        "company_name": f"PT Iter10 {suffix}",
        "name": "PIC Iter10",
        "email": email,
        "phone": "0812345678",
        "npwp": "01.234.567.8-901.000",
        "address": "Jl. Test",
        "bank_name": "BCA",
        "bank_account": "1234567890",
        "is_importer": True,
        "default_password": "vendor123",
    }
    r = requests.post(f"{BASE_URL}/api/vendors", json=payload, headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "approved"
    assert data["company_name"] == payload["company_name"]
    assert data["email"] == email.lower()
    assert data["is_importer"] is True
    assert data["code"].startswith("V-") and len(data["code"]) == 10
    assert data.get("default_password") == "vendor123"
    assert data.get("user_id")
    vid = data["id"]

    # GET verify persisted
    g = requests.get(f"{BASE_URL}/api/vendors/{vid}", headers=admin_headers, timeout=15)
    assert g.status_code == 200
    assert g.json()["email"] == email.lower()

    # Vendor login works
    lr = requests.post(f"{BASE_URL}/api/auth/login",
                       json={"email": email, "password": "vendor123"}, timeout=15)
    assert lr.status_code == 200, lr.text
    me = requests.get(f"{BASE_URL}/api/auth/me",
                      headers={"Authorization": f"Bearer {lr.json()['access_token']}"},
                      timeout=15)
    assert me.status_code == 200
    me_data = me.json()
    assert me_data["role"] == "vendor"
    assert me_data.get("vendor_id") == vid


def test_manual_vendor_duplicate_email_rejected(admin_headers):
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_dup_{suffix}@example.com"
    payload = {"company_name": "PT Dup", "name": "Dup", "email": email}
    r1 = requests.post(f"{BASE_URL}/api/vendors", json=payload, headers=admin_headers, timeout=15)
    assert r1.status_code == 200
    r2 = requests.post(f"{BASE_URL}/api/vendors", json=payload, headers=admin_headers, timeout=15)
    assert r2.status_code == 400


def test_manual_vendor_create_forbidden_for_vendor_role(admin_headers):
    # Create a vendor first, then use its token
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_forbid_{suffix}@example.com"
    c = requests.post(f"{BASE_URL}/api/vendors",
                      json={"company_name": "PT F", "name": "F", "email": email},
                      headers=admin_headers, timeout=15)
    assert c.status_code == 200
    lr = requests.post(f"{BASE_URL}/api/auth/login",
                       json={"email": email, "password": "vendor123"}, timeout=15)
    assert lr.status_code == 200
    vtoken = lr.json()["access_token"]
    r = requests.post(f"{BASE_URL}/api/vendors",
                      json={"company_name": "X", "name": "X", "email": "xx@e.com"},
                      headers={"Authorization": f"Bearer {vtoken}"}, timeout=15)
    assert r.status_code == 403


def test_manual_vendor_missing_required_field(admin_headers):
    r = requests.post(f"{BASE_URL}/api/vendors",
                      json={"name": "no company"},
                      headers=admin_headers, timeout=15)
    assert r.status_code == 422


# ------- CSV Import endpoint still exists -------
def test_vendor_csv_import_endpoint_available(admin_headers):
    suffix = uuid.uuid4().hex[:8]
    csv_content = (
        "company_name,name,email,phone,npwp,is_importer\n"
        f"PT CSV Iter10 {suffix},PIC CSV,TEST_csv_{suffix}@example.com,0899,00.000.000.0-000.000,false\n"
    )
    files = {"file": (f"vendors_{suffix}.csv", csv_content, "text/csv")}
    r = requests.post(f"{BASE_URL}/api/import/vendors.csv",
                      files=files, headers=admin_headers, timeout=30)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
    body = r.json()
    # Verify at least imported count reported
    assert any(k in body for k in ("created", "imported", "count", "ok", "rows"))


# ------- Regression: preview pages return 200 (frontend index) -------
@pytest.mark.parametrize("path", ["/po", "/customs-documents", "/warehouse-stock"])
def test_preview_pages_200(path):
    # frontend served through same base URL (React SPA returns index.html)
    r = requests.get(f"{BASE_URL}{path}", timeout=15)
    assert r.status_code == 200, f"{path} returned {r.status_code}"
    assert "<div id=\"root\">" in r.text or "<!DOCTYPE html>" in r.text.lower()[:200]
