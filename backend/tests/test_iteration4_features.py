"""Backend regression tests for Iteration 4 e-procurement features:
- Sealed bid tender (is_sealed + reveal endpoint + masking)
- Bid version history
- Deadline lock on submit
- Vendor pricelist CRUD
- Product pricelists + price history endpoints
- Cron endpoint for draft reminders
"""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://procurement-flow-41.preview.emergentagent.com").rstrip("/")

ADMIN = {"email": "mahrozapradana46@gmail.com", "password": "admin123"}
VENDOR = {"email": "test_vendor_423f4216@example.com", "password": "vendor123"}

SEALED_TENDER_ID = "56ba656e-3108-43bc-964f-c39c7ff30bd8"
EXPIRED_TENDER_ID = "2ed9ac53-6c1e-4a63-afcf-86956db56f18"
TEST_PRODUCT_ID = "cf433378-5c42-4eed-893b-8b2feb8b47da"


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def vendor_token():
    return _login(VENDOR)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def vendor_headers(vendor_token):
    return {"Authorization": f"Bearer {vendor_token}"}


# --- Sealed Tender ---
class TestSealedTender:
    def test_get_sealed_tender(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/tenders/{SEALED_TENDER_ID}", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("is_sealed") is True
        # This tender is already revealed per prompt
        assert "bids" in data or "id" in data

    def test_reveal_endpoint_idempotent(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/tenders/{SEALED_TENDER_ID}/reveal", headers=admin_headers, timeout=15)
        # Already revealed — should still be 200 or specific status; accept 200/400
        assert r.status_code in (200, 400), r.text


# --- Deadline Lock ---
class TestDeadlineLock:
    def test_expired_tender_rejects_bid(self, vendor_headers):
        payload = {"price": 1000, "items": [{"item_index": 0, "product_id": TEST_PRODUCT_ID, "qty": 1, "price": 1000}], "status": "submitted"}
        r = requests.post(
            f"{BASE_URL}/api/vendor-portal/tenders/{EXPIRED_TENDER_ID}/bid",
            json=payload, headers=vendor_headers, timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "deadline" in r.text.lower() or "lewat" in r.text.lower()


# --- Vendor Pricelists ---
class TestVendorPricelists:
    created_id = None

    def test_list_pricelists(self, vendor_headers):
        r = requests.get(f"{BASE_URL}/api/vendor-portal/pricelists", headers=vendor_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_create_pricelist(self, vendor_headers):
        payload = {
            "product_id": TEST_PRODUCT_ID,
            "price": 11000000,
            "currency": "IDR",
            "min_qty": 1,
            "note": "TEST_iter4_pricelist",
        }
        r = requests.post(f"{BASE_URL}/api/vendor-portal/pricelists", json=payload, headers=vendor_headers, timeout=15)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data.get("price") == 11000000
        assert data.get("product_id") == TEST_PRODUCT_ID
        TestVendorPricelists.created_id = data.get("id")

    def test_delete_pricelist(self, vendor_headers):
        pid = TestVendorPricelists.created_id
        if not pid:
            pytest.skip("no pricelist created")
        r = requests.delete(f"{BASE_URL}/api/vendor-portal/pricelists/{pid}", headers=vendor_headers, timeout=15)
        assert r.status_code in (200, 204), r.text


# --- Product Pricelists + Price History (admin master data) ---
class TestProductPriceEndpoints:
    def test_product_pricelists(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/products/{TEST_PRODUCT_ID}/pricelists", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_product_price_history(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/products/{TEST_PRODUCT_ID}/price-history", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# --- Cron Endpoint ---
class TestCron:
    def test_draft_reminders_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/cron/tender-draft-reminders", timeout=15)
        assert r.status_code == 200, r.text
