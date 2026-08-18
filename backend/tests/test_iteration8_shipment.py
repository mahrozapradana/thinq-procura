"""Iteration 8 backend tests: vendor-portal shipment endpoints (regression for 404 fix)."""
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
        return ""
    return ""


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env_from_frontend()).rstrip("/")

VENDOR_EMAIL = "test_vendor_423f4216@example.com"
VENDOR_PASS = "vendor123"
ADMIN_EMAIL = "mahrozapradana46@gmail.com"
ADMIN_PASS = "admin123"


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=60)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def vh():
    return {"Authorization": f"Bearer {_login(VENDOR_EMAIL, VENDOR_PASS)}"}


@pytest.fixture(scope="module")
def ah():
    return {"Authorization": f"Bearer {_login(ADMIN_EMAIL, ADMIN_PASS)}"}


# ---- shipment listing endpoints ----

def test_shipments_records_returns_200(vh):
    r = requests.get(f"{BASE_URL}/api/vendor-portal/shipments/records", headers=vh, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # SHP-20260818-F4F13 was created earlier
    nums = [d.get("shipment_number") for d in data]
    assert any(n and n.startswith("SHP-") for n in nums), f"expected SHP-* in records, got {nums}"


def test_shipments_pending_pos_returns_200(vh):
    r = requests.get(f"{BASE_URL}/api/vendor-portal/shipments", headers=vh, timeout=30)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_shipments_records_forbidden_to_admin(ah):
    r = requests.get(f"{BASE_URL}/api/vendor-portal/shipments/records", headers=ah, timeout=30)
    assert r.status_code in (401, 403), f"admin should NOT access vendor-portal, got {r.status_code}"


# ---- shipment create validation ----

@pytest.fixture(scope="module")
def some_po_id(vh):
    r = requests.get(f"{BASE_URL}/api/vendor-portal/shipments", headers=vh, timeout=30)
    assert r.status_code == 200
    pos = r.json()
    if not pos:
        pytest.skip("no pending PO to test shipment create against")
    return pos[0]["id"], len(pos[0].get("items") or [])


def test_create_shipment_bad_item_index(vh, some_po_id):
    pid, n_items = some_po_id
    payload = {"po_id": pid, "items": [{"po_item_index": 999, "qty_shipped": 1}]}
    r = requests.post(f"{BASE_URL}/api/vendor-portal/shipments", headers=vh, json=payload, timeout=30)
    assert r.status_code == 400, r.text
    assert "index" in r.text.lower()


def test_create_shipment_qty_le_zero(vh, some_po_id):
    pid, n_items = some_po_id
    if n_items < 1:
        pytest.skip("PO has no items")
    payload = {"po_id": pid, "items": [{"po_item_index": 0, "qty_shipped": 0}]}
    r = requests.post(f"{BASE_URL}/api/vendor-portal/shipments", headers=vh, json=payload, timeout=30)
    assert r.status_code == 400, r.text
    assert "qty" in r.text.lower()


def test_create_shipment_non_owned_po_404(vh):
    payload = {"po_id": "non-existent-po-id-xyz", "items": [{"po_item_index": 0, "qty_shipped": 1}]}
    r = requests.post(f"{BASE_URL}/api/vendor-portal/shipments", headers=vh, json=payload, timeout=30)
    assert r.status_code == 404, r.text


def test_create_shipment_empty_items_400(vh, some_po_id):
    pid, _ = some_po_id
    payload = {"po_id": pid, "items": []}
    r = requests.post(f"{BASE_URL}/api/vendor-portal/shipments", headers=vh, json=payload, timeout=30)
    assert r.status_code == 400, r.text


def test_create_shipment_pricelist_fallback(vh, some_po_id):
    """If shipping_cost=0, backend should fall back to sum(qty*unit_price) of pricelist."""
    pid, n_items = some_po_id
    if n_items < 1:
        pytest.skip("PO has no items")
    payload = {
        "po_id": pid,
        "items": [{"po_item_index": 0, "qty_shipped": 0.01}],
        "shipping_cost": 0,
        "shipping_pricelist": [{"name": "Ongkir", "qty": 2, "unit_price": 12500}],
        "notes": "TEST_iter8_fallback",
    }
    r = requests.post(f"{BASE_URL}/api/vendor-portal/shipments", headers=vh, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc.get("shipment_number", "").startswith("SHP-")
    assert doc.get("shipping_cost") == 25000
    # verify persistence via records list
    r2 = requests.get(f"{BASE_URL}/api/vendor-portal/shipments/records", headers=vh, timeout=30)
    assert r2.status_code == 200
    nums = [d.get("shipment_number") for d in r2.json()]
    assert doc["shipment_number"] in nums
