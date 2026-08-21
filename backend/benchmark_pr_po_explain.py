from __future__ import annotations

from native_pg_repositories import ExplainNativeRepository


def _print_block(title: str, lines: list[str]) -> None:
    print(f"\n=== {title} ===")
    for line in lines:
        print(line)


def main() -> None:
    repo = ExplainNativeRepository()

    pr_cases = [
        {
            "label": "PR list - requester + status",
            "args": {
                "requester_id": "00000000-0000-0000-0000-000000000001",
                "status": "pending_approval",
                "department_id": None,
                "search": None,
                "page": 1,
                "page_size": 20,
            },
        },
        {
            "label": "PR list - department + search",
            "args": {
                "requester_id": None,
                "status": None,
                "department_id": "00000000-0000-0000-0000-000000000010",
                "search": "PR-2026",
                "page": 1,
                "page_size": 20,
            },
        },
    ]

    po_cases = [
        {
            "label": "PO list - vendor + status",
            "args": {
                "vendor_id": "00000000-0000-0000-0000-000000000101",
                "assigned_pic_id": None,
                "status": "approved",
                "po_type": None,
                "search": None,
                "page": 1,
                "page_size": 20,
            },
        },
        {
            "label": "PO list - assigned PIC + search",
            "args": {
                "vendor_id": None,
                "assigned_pic_id": "00000000-0000-0000-0000-000000000201",
                "status": None,
                "po_type": None,
                "search": "urgent",
                "page": 1,
                "page_size": 20,
            },
        },
    ]

    for case in pr_cases:
        plans = repo.explain_pr_list(**case["args"])
        _print_block(f"{case['label']} | count", plans["count"])
        _print_block(f"{case['label']} | list", plans["list"])

    for case in po_cases:
        plans = repo.explain_po_list(**case["args"])
        _print_block(f"{case['label']} | count", plans["count"])
        _print_block(f"{case['label']} | list", plans["list"])


if __name__ == "__main__":
    main()
