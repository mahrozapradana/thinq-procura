"""Iteration 7 backend tests: PR verified hint (cheapest), overdue-invoice cron, invoice audit trail (create/pay/cancel)."""
import os
import pytest
import requests
import time

def _read_env_from_frontend():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        return ""
    return ""

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env_from_frontend()).rstrip("/")

ADMIN_EMAIL = "mahrozapradana46@gmail.com"
ADMIN_PASS = "admin123"
VENDOR_EMAIL = "test_vendor_423f4216@example.com"
VENDOR_PASS = "vendor123"
VERIFIED_PRODUCT_ID = "cf433378-5c42-4eed-893b-8b2feb8b47da"


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=60)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def vendor_token():
    return _login(VENDOR_EMAIL, VENDOR_PASS)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def vendor_headers(vendor_token):
    return {"Authorization": f"Bearer {vendor_token}"}


# ---------- Feature: Cheapest verified pricelist (PR auto-fill hint source) ----------
class TestCheapestPricelist:
    def test_cheapest_returns_verified_for_seeded_product(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/pricelists/cheapest",
            params={"product_id": VERIFIED_PRODUCT_ID, "only_verified": "true"},
            headers=admin_headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "cheapest" in data
        ch = data["cheapest"]
        assert ch is not None, "expected a verified cheapest pricelist"
        assert ch.get("verified") is True
        assert ch.get("product_id") == VERIFIED_PRODUCT_ID
        assert float(ch.get("price") or 0) > 0
        assert ch.get("vendor_id")
        assert ch.get("vendor_name")

    def test_cheapest_empty_shape(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/pricelists/cheapest",
            params={"product_id": "nonexistent-product-id", "only_verified": "true"},
            headers=admin_headers, timeout=60,
        )
        assert r.status_code == 200
        assert r.json().get("cheapest") in (None, {})


# ---------- Feature: Overdue Invoice Reminder cron ----------
class TestOverdueInvoiceReminder:
    def test_cron_endpoint_enqueues(self):
        # No auth required per implementation (GET) — public cron endpoint
        r = requests.get(f"{BASE_URL}/api/cron/overdue-invoice-reminder", timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("enqueued") is True
        assert "run_id" in data


# ---------- Feature: Invoice Audit Trail ----------
class TestInvoiceAuditTrail:
    @pytest.fixture(scope="class")
    def existing_invoice(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/invoices", headers=admin_headers, timeout=60)
        assert r.status_code == 200
        invoices = r.json()
        assert isinstance(invoices, list) and len(invoices) > 0, "need at least one invoice"
        # pick an outstanding invoice for pay test if possible
        outstanding = [i for i in invoices if i.get("status") == "outstanding"]
        return outstanding[0] if outstanding else invoices[0]

    def test_invoice_detail_has_audit_trail(self, admin_headers, existing_invoice):
        iid = existing_invoice["id"]
        r = requests.get(f"{BASE_URL}/api/invoices/{iid}", headers=admin_headers, timeout=60)
        assert r.status_code == 200
        inv = r.json()
        # audit_trail may be missing for legacy invoices; if present must be a list
        at = inv.get("audit_trail")
        if at is not None:
            assert isinstance(at, list)
            for e in at:
                assert "action" in e and "at" in e
                assert e["action"] in ("created", "paid", "cancelled")

    def test_pay_invoice_idempotent(self, admin_headers, existing_invoice):
        iid = existing_invoice["id"]
        status = existing_invoice.get("status")
        r1 = requests.post(f"{BASE_URL}/api/invoices/{iid}/pay", headers=admin_headers, timeout=60)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1.get("ok") is True
        # Second call must be idempotent
        r2 = requests.post(f"{BASE_URL}/api/invoices/{iid}/pay", headers=admin_headers, timeout=60)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2.get("ok") is True
        assert d2.get("already_paid") is True
        # verify audit entry added
        d = requests.get(f"{BASE_URL}/api/invoices/{iid}", headers=admin_headers, timeout=60).json()
        at = d.get("audit_trail") or []
        actions = [e.get("action") for e in at]
        assert "paid" in actions, f"expected paid audit entry, got {actions}"

    def test_pay_requires_finance_or_admin(self, vendor_headers, existing_invoice):
        iid = existing_invoice["id"]
        r = requests.post(f"{BASE_URL}/api/invoices/{iid}/pay", headers=vendor_headers, timeout=60)
        assert r.status_code == 403


# ---------- Feature: Tenders admin (list should still work; filtering is UI-side) ----------
class TestTenders:
    def test_admin_list_tenders(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/tenders", headers=admin_headers, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # spot-check shape when populated
        if data:
            t = data[0]
            assert "status" in t
            assert "id" in t
