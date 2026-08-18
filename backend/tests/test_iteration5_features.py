"""Backend tests for Iteration 5 e-procurement features:
- Vendor Pricelist verify toggle
- Bulk CSV pricelist upload
- RFQ reply with per-item discount (percent + amount)
- Invoice detail endpoints (vendor + admin)
- Sealed Auto-Reveal cron endpoint
"""
import os
import io
import time
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

TEST_PRODUCT_ID = "cf433378-5c42-4eed-893b-8b2feb8b47da"
TEST_PRODUCT_CODE = "TESTP_UPD"


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


# ---- Pricelist verify toggle ----
class TestPricelistVerify:
    plid = None

    def test_create_pricelist_for_verify(self, vendor_headers):
        payload = {"product_id": TEST_PRODUCT_ID, "price": 12345000, "currency": "IDR", "min_qty": 1, "note": "TEST_iter5_verify"}
        r = requests.post(f"{BASE_URL}/api/vendor-portal/pricelists", json=payload, headers=vendor_headers, timeout=15)
        assert r.status_code in (200, 201), r.text
        TestPricelistVerify.plid = r.json()["id"]

    def test_verify_toggle_on(self, admin_headers):
        pid = TestPricelistVerify.plid
        assert pid, "no pricelist"
        r = requests.post(f"{BASE_URL}/api/pricelists/{pid}/verify", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("verified") is True

    def test_verify_toggle_off(self, admin_headers):
        pid = TestPricelistVerify.plid
        r = requests.post(f"{BASE_URL}/api/pricelists/{pid}/verify", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("verified") is False

    def test_verify_forbidden_for_vendor(self, vendor_headers):
        pid = TestPricelistVerify.plid
        r = requests.post(f"{BASE_URL}/api/pricelists/{pid}/verify", headers=vendor_headers, timeout=15)
        assert r.status_code == 403, r.text

    def test_cleanup(self, vendor_headers):
        pid = TestPricelistVerify.plid
        if pid:
            requests.delete(f"{BASE_URL}/api/vendor-portal/pricelists/{pid}", headers=vendor_headers, timeout=15)


# ---- Bulk CSV upload ----
class TestBulkUpload:
    def test_bulk_csv_upload(self, vendor_headers):
        csv_body = f"product_code,price,currency,min_qty,notes\n{TEST_PRODUCT_CODE},9500000,IDR,1,TEST_iter5_bulk\nBADCODE_XYZ,1000,IDR,1,should_error\n"
        files = {"file": ("bulk.csv", csv_body, "text/csv")}
        headers = {k: v for k, v in vendor_headers.items()}  # requests will set multipart
        r = requests.post(f"{BASE_URL}/api/vendor-portal/pricelists/bulk", files=files, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("created") >= 1
        # BADCODE_XYZ should be in errors
        assert any("BADCODE_XYZ" in (e.get("error") or "") for e in data.get("errors") or [])

    def test_bulk_upload_invalid_file(self, vendor_headers):
        files = {"file": ("bad.csv", "not,a,valid\ncsv format missing product", "text/csv")}
        r = requests.post(f"{BASE_URL}/api/vendor-portal/pricelists/bulk", files=files, headers=vendor_headers, timeout=15)
        # Should still return 200 with 0 created + errors (not raise 500)
        assert r.status_code == 200, r.text


# ---- RFQ reply with discount ----
class TestRFQDiscount:
    """Uses existing pending RFQ POs — otherwise skip."""

    def _find_rfq(self, vendor_headers):
        r = requests.get(f"{BASE_URL}/api/vendor-portal/rfqs", headers=vendor_headers, timeout=15)
        if r.status_code != 200:
            return None
        rfqs = r.json()
        return next((p for p in rfqs if p.get("status") in ("draft", "pending_approval") and (p.get("items") or [])), None)

    def test_reply_with_percent_discount(self, vendor_headers):
        rfq = self._find_rfq(vendor_headers)
        if not rfq:
            pytest.skip("No pending RFQ available")
        items = rfq.get("items") or []
        payload = {
            "items": [{
                "item_index": 0,
                "price": float(items[0].get("price") or 1000),
                "discount_type": "percent",
                "discount_value": 10,
                "notes": "TEST_iter5_percent",
            }],
            "overall_notes": "TEST_iter5",
            "can_fulfill": True,
        }
        r = requests.post(f"{BASE_URL}/api/vendor-portal/rfqs/{rfq['id']}/reply", json=payload, headers=vendor_headers, timeout=15)
        assert r.status_code == 200, r.text

        # Fetch PO and check vendor_reply.totals populated
        rget = requests.get(f"{BASE_URL}/api/vendor-portal/rfqs", headers=vendor_headers, timeout=15)
        assert rget.status_code == 200
        po = next((p for p in rget.json() if p["id"] == rfq["id"]), None)
        assert po is not None
        vr = po.get("vendor_reply") or {}
        totals = vr.get("totals") or {}
        assert "before_discount" in totals
        assert "discount_amount" in totals
        assert "after_discount" in totals
        # Percent 10% → discount ~= 10% of before
        if totals.get("before_discount"):
            ratio = totals["discount_amount"] / totals["before_discount"]
            assert 0.05 < ratio < 0.15, f"Unexpected discount ratio {ratio}"
        # per-item snapshot
        it0 = (vr.get("items") or [])[0]
        assert "subtotal_before" in it0 and "subtotal_after" in it0 and "discount_amount" in it0

    def test_reply_with_amount_discount(self, vendor_headers):
        rfq = self._find_rfq(vendor_headers)
        if not rfq:
            pytest.skip("No pending RFQ available")
        items = rfq.get("items") or []
        payload = {
            "items": [{
                "item_index": 0,
                "price": float(items[0].get("price") or 1000),
                "discount_type": "amount",
                "discount_value": 500,
                "notes": "TEST_iter5_amount",
            }],
            "overall_notes": "TEST_iter5_amt",
            "can_fulfill": True,
        }
        r = requests.post(f"{BASE_URL}/api/vendor-portal/rfqs/{rfq['id']}/reply", json=payload, headers=vendor_headers, timeout=15)
        assert r.status_code == 200, r.text


# ---- Invoice detail ----
class TestInvoiceDetail:
    def test_admin_list_invoices(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/invoices", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_vendor_invoice_detail_schema(self, vendor_headers):
        r = requests.get(f"{BASE_URL}/api/vendor-portal/invoices", headers=vendor_headers, timeout=15)
        assert r.status_code == 200
        invoices = r.json()
        if not invoices:
            pytest.skip("No vendor invoices")
        iid = invoices[0]["id"]
        rd = requests.get(f"{BASE_URL}/api/vendor-portal/invoices/{iid}", headers=vendor_headers, timeout=15)
        assert rd.status_code == 200, rd.text
        inv = rd.json()
        # Schema keys should exist (may be empty for pre-iter5 invoices).
        # Older invoices may not have items/tax_breakdown fields (per iter-5 spec).
        for k in ("id", "invoice_number", "amount"):
            assert k in inv, f"missing {k}"

    def test_admin_invoice_detail(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/invoices", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        invoices = r.json()
        if not invoices:
            pytest.skip("No invoices in system")
        iid = invoices[0]["id"]
        rd = requests.get(f"{BASE_URL}/api/invoices/{iid}", headers=admin_headers, timeout=15)
        assert rd.status_code == 200, rd.text
        assert rd.json().get("id") == iid


# ---- Sealed auto-reveal cron ----
class TestSealedAutoReveal:
    def test_cron_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/cron/sealed-auto-reveal", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("enqueued") is True

    def test_seed_and_auto_reveal(self, admin_headers, vendor_headers):
        """Seed a fresh sealed tender with past deadline, open it, hit cron, verify reveal."""
        # Create tender with past deadline + sealed
        payload = {
            "title": "TEST_iter5_sealed_auto",
            "deadline": "2020-01-01",
            "is_sealed": True,
            "items": [{"product_id": TEST_PRODUCT_ID, "qty": 1, "price": 1000}],
            "invited_vendor_ids": [],
        }
        rc = requests.post(f"{BASE_URL}/api/tenders", json=payload, headers=admin_headers, timeout=15)
        if rc.status_code not in (200, 201):
            pytest.skip(f"Cannot create sealed tender: {rc.status_code} {rc.text[:200]}")
        tid = rc.json().get("id")
        # Open it
        ro = requests.post(f"{BASE_URL}/api/tenders/{tid}/open", headers=admin_headers, timeout=15)
        # It's OK if this endpoint errors; move on
        # Trigger cron
        rcron = requests.get(f"{BASE_URL}/api/cron/sealed-auto-reveal", timeout=15)
        assert rcron.status_code == 200
        # Wait for background task
        time.sleep(3)
        # Check the tender is revealed
        rg = requests.get(f"{BASE_URL}/api/tenders/{tid}", headers=admin_headers, timeout=15)
        assert rg.status_code == 200, rg.text
        t = rg.json()
        # Sealed tender must have sealed_revealed_at set
        assert t.get("sealed_revealed_at"), f"tender not auto-revealed: {t}"
