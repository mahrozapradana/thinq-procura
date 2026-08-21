from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import psycopg
from psycopg.rows import dict_row


ROOT_DIR = Path(__file__).parent
DDL_FILES = [
    ROOT_DIR / "database" / "native_pg" / "001_schema.sql",
    ROOT_DIR / "database" / "native_pg" / "020_partitions.sql",
]


def get_native_pg_dsn() -> str:
    dsn = os.environ.get("PG_NATIVE_DSN")
    if not dsn:
        raise RuntimeError("PG_NATIVE_DSN is required for native PostgreSQL access")
    return dsn


@contextmanager
def native_pg_connection(autocommit: bool = False) -> Iterator[psycopg.Connection]:
    with psycopg.connect(get_native_pg_dsn(), row_factory=dict_row, autocommit=autocommit) as conn:
        yield conn


def apply_native_schema() -> None:
    with native_pg_connection(autocommit=True) as conn:
        for ddl_file in DDL_FILES:
            conn.execute(ddl_file.read_text(encoding="utf-8"))