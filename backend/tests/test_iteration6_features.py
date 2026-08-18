"""Backend regression tests for Iteration 6 features:
- Invoice line_item validation (qty > remaining, wrong item_index)
- Mandatory Faktur Pajak + BAST enforcement
- Billing-status endpoint (vendor + admin variants)
- Invoice PDF export
- Bulk PO Import via CSV
- Verified vendor pricelist cheapest lookup
"""
import io
import os
import pytest
import requests


def _read_env_from_frontend():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env_from_frontend() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

ADMIN = {"email": "mahrozapradana46@gmail.com", "password": "admin123"}
VENDOR = {"email": "test_vendor_423f4216@example.com", "password": "vendor123"}

TEST_PO_ID = "ff247e59-d3e0-44f1-a482-3a29b86361e4"
EXISTING_INV_ID = "233460fd-7408-4f69-aa38-3622d2e64702"


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def vendor_headers():
    return {"Authorization": f"Bearer {_login(VENDOR)}"}


# ---------- Billing-status endpoints ----------
class TestBillingStatus:
    def test_vendor_billing_status(self, vendor_headers):
        r = requests.get(f"{BASE_URL}/api/vendor-portal/pos/{TEST_PO_ID}/billing-status", headers=vendor_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["po_id"] == TEST_PO_ID
        assert isinstance(data["items"], list) and len(data["items"]) > 0
        for it in data["items"]:
            for k in ("item_index", "qty_ordered", "qty_billed", "qty_remaining"):
                assert k in it

    def test_admin_billing_status(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/pos/{TEST_PO_ID}/billing-status", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["po_id"] == TEST_PO_ID

    def test_admin_billing_status_404(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/pos/nonexistent-po-id/billing-status", headers=admin_headers, timeout=15)
        assert r.status_code == 404


# ---------- Invoice submission validation ----------
class TestInvoiceSubmitValidation:
    def _get_line(self, vendor_headers):
        r = requests.get(f"{BASE_URL}/api/vendor-portal/pos/{TEST_PO_ID}/billing-status", headers=vendor_headers, timeout=15)
        assert r.status_code == 200
        items = r.json().get("items") or []
        # find any item with remaining > 0 else fall back
        for it in items:
            if float(it.get("qty_remaining") or 0) > 0:
                return it
        return items[0]

    def test_missing_faktur_pajak(self, vendor_headers):
        payload = {
            "po_id": TEST_PO_ID,
            "amount": 100,
            "line_items": [{"po_item_index": 0, "qty_billed": 0.1}],
            "bast_url": "https://example.com/bast.pdf",
        }
        r = requests.post(f"{BASE_URL}/api/vendor-portal/invoices", json=payload, headers=vendor_headers, timeout=15)
        assert r.status_code == 400, r.text
        assert "Faktur Pajak" in (r.json().get("detail") or "")

    def test_missing_bast(self, vendor_headers):
        payload = {
            "po_id": TEST_PO_ID,
            "amount": 100,
            "line_items": [{"po_item_index": 0, "qty_billed": 0.1}],
            "faktur_pajak_url": "https://example.com/fp.pdf",
        }
        r = requests.post(f"{BASE_URL}/api/vendor-portal/invoices", json=payload, headers=vendor_headers, timeout=15)
        assert r.status_code == 400
        assert "BAST" in (r.json().get("detail") or "")

    def test_missing_line_items(self, vendor_headers):
        payload = {
            "po_id": TEST_PO_ID,
            "amount": 100,
            "faktur_pajak_url": "https://example.com/fp.pdf",
            "bast_url": "https://example.com/bast.pdf",
            "line_items": [],
        }
        r = requests.post(f"{BASE_URL}/api/vendor-portal/invoices", json=payload, headers=vendor_headers, timeout=15)
        assert r.status_code == 400
        assert "item" in (r.json().get("detail") or "").lower()

    def test_invalid_item_index(self, vendor_headers):
        payload = {
            "po_id": TEST_PO_ID,
            "amount": 100,
            "faktur_pajak_url": "https://example.com/fp.pdf",
            "bast_url": "https://example.com/bast.pdf",
            "line_items": [{"po_item_index": 999, "qty_billed": 0.1}],
        }
        r = requests.post(f"{BASE_URL}/api/vendor-portal/invoices", json=payload, headers=vendor_headers, timeout=15)
        assert r.status_code == 400
        assert "index" in (r.json().get("detail") or "").lower()

    def test_qty_exceeds_remaining(self, vendor_headers):
        line = self._get_line(vendor_headers)
        payload = {
            "po_id": TEST_PO_ID,
            "amount": 100,
            "faktur_pajak_url": "https://example.com/fp.pdf",
            "bast_url": "https://example.com/bast.pdf",
            "line_items": [{"po_item_index": line["item_index"], "qty_billed": (line["qty_ordered"] or 1) * 1000 + 1}],
        }
        r = requests.post(f"{BASE_URL}/api/vendor-portal/invoices", json=payload, headers=vendor_headers, timeout=15)
        assert r.status_code == 400
        assert "sisa" in (r.json().get("detail") or "").lower() or "melebihi" in (r.json().get("detail") or "").lower()

    def test_zero_qty(self, vendor_headers):
        line = self._get_line(vendor_headers)
        payload = {
            "po_id": TEST_PO_ID,
            "amount": 100,
            "faktur_pajak_url": "https://example.com/fp.pdf",
            "bast_url": "https://example.com/bast.pdf",
            "line_items": [{"po_item_index": line["item_index"], "qty_billed": 0}],
        }
        r = requests.post(f"{BASE_URL}/api/vendor-portal/invoices", json=payload, headers=vendor_headers, timeout=15)
        assert r.status_code == 400


# ---------- Invoice PDF export ----------
class TestInvoicePDF:
    def test_pdf_export_admin(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/invoices/{EXISTING_INV_ID}/pdf", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 500

    def test_pdf_export_not_found(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/invoices/nonexistent-inv/pdf", headers=admin_headers, timeout=15)
        assert r.status_code == 404


# ---------- Bulk PO Import ----------
class TestBulkPOImport:
    def test_bulk_import_all_errors(self, admin_headers):
        """Upload CSV with unknown codes → 0 created + errors, no 500."""
        csv_body = "vendor_code,product_code,qty,price\nBADVENDOR_XYZ,BADPROD_XYZ,2,10000\n"
        files = {"file": ("bulk.csv", csv_body, "text/csv")}
        r = requests.post(f"{BASE_URL}/api/pos/bulk-import", files=files, headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["created_count"] == 0
        assert data["total_rows"] == 1
        assert len(data["errors"]) >= 1

    def test_bulk_import_vendor_forbidden(self, vendor_headers):
        csv_body = "vendor_code,product_code,qty,price\nX,Y,1,1\n"
        files = {"file": ("bulk.csv", csv_body, "text/csv")}
        r = requests.post(f"{BASE_URL}/api/pos/bulk-import", files=files, headers=vendor_headers, timeout=15)
        assert r.status_code == 403

    def test_bulk_import_happy_path(self, admin_headers):
        """Look up an approved vendor with code and an existing product; try creating one PO."""
        # find a vendor with a non-empty code
        rv = requests.get(f"{BASE_URL}/api/vendors", headers=admin_headers, timeout=15)
        if rv.status_code != 200:
            pytest.skip("Cannot list vendors")
        vendors = [v for v in rv.json() if v.get("status") == "approved" and v.get("code")]
        rp = requests.get(f"{BASE_URL}/api/products", headers=admin_headers, timeout=15)
        products = rp.json() if rp.status_code == 200 else []
        products = [p for p in products if p.get("code")]
        if not vendors or not products:
            pytest.skip("No approved vendors with code or products with code")
        vcode = vendors[0]["code"]
        pcode = products[0]["code"]
        csv_body = f"vendor_code,product_code,qty,price\n{vcode},{pcode},2,50000\n{vcode},{pcode},3,75000\n"
        files = {"file": ("bulk.csv", csv_body, "text/csv")}
        r = requests.post(f"{BASE_URL}/api/pos/bulk-import", files=files, headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["created_count"] >= 1
        # both rows same vendor/currency/po_type → one PO with 2 items
        assert data["created"][0]["items"] == 2
        assert data["created"][0]["po_number"].startswith("PO-BULK-")


# ---------- Cheapest verified vendor pricelist ----------
class TestCheapestPricelist:
    def test_cheapest_endpoint_shape(self, admin_headers):
        # Just call with an arbitrary product_id; shape must be stable even if empty
        r = requests.get(f"{BASE_URL}/api/pricelists/cheapest", params={"product_id": "nonexistent", "only_verified": "true"}, headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["product_id"] == "nonexistent"
        assert data["count"] == 0
        assert data["cheapest"] is None
        assert data["top3"] == []

    def test_cheapest_returns_only_verified(self, admin_headers, vendor_headers):
        """Create pricelist, verify it, ensure cheapest returns it."""
        # find product
        rp = requests.get(f"{BASE_URL}/api/products", headers=admin_headers, timeout=15)
        if rp.status_code != 200 or not rp.json():
            pytest.skip("No products available")
        pid = rp.json()[0]["id"]
        # vendor creates 2 pricelists — one verified, one not
        r1 = requests.post(f"{BASE_URL}/api/vendor-portal/pricelists", json={"product_id": pid, "price": 111111, "currency": "IDR", "min_qty": 1, "note": "TEST_iter6_a"}, headers=vendor_headers, timeout=15)
        r2 = requests.post(f"{BASE_URL}/api/vendor-portal/pricelists", json={"product_id": pid, "price": 99999, "currency": "IDR", "min_qty": 1, "note": "TEST_iter6_b_cheap"}, headers=vendor_headers, timeout=15)
        assert r1.status_code in (200, 201) and r2.status_code in (200, 201)
        id1 = r1.json()["id"]
        id2 = r2.json()["id"]
        try:
            # verify only the more expensive one
            rv1 = requests.post(f"{BASE_URL}/api/pricelists/{id1}/verify", headers=admin_headers, timeout=15)
            assert rv1.status_code == 200 and rv1.json().get("verified") is True
            rc = requests.get(f"{BASE_URL}/api/pricelists/cheapest", params={"product_id": pid, "only_verified": "true"}, headers=admin_headers, timeout=15)
            assert rc.status_code == 200
            data = rc.json()
            # cheapest verified should be id1 (the only verified)
            assert data["cheapest"] is not None
            assert data["cheapest"]["id"] == id1

            # with only_verified=false the cheapest should be id2
            rc2 = requests.get(f"{BASE_URL}/api/pricelists/cheapest", params={"product_id": pid, "only_verified": "false"}, headers=admin_headers, timeout=15)
            assert rc2.status_code == 200
            data2 = rc2.json()
            assert data2["cheapest"] is not None
            assert data2["cheapest"]["price"] <= data["cheapest"]["price"]
        finally:
            for x in (id1, id2):
                requests.delete(f"{BASE_URL}/api/vendor-portal/pricelists/{x}", headers=vendor_headers, timeout=10)
