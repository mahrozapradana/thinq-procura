from __future__ import annotations

import asyncio
import os
import re
import uuid
from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime, timezone
from typing import Any, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from native_pg import apply_native_schema, get_native_pg_dsn


MISSING = object()


@dataclass
class InsertOneResult:
    inserted_id: Any


@dataclass
class UpdateResult:
    matched_count: int
    modified_count: int
    upserted_id: Optional[Any] = None


@dataclass
class DeleteResult:
    deleted_count: int


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_json_compatible(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, dict):
        return {k: _to_json_compatible(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_json_compatible(v) for v in value]
    return value


def _split_path(path: str) -> list[str]:
    return [part for part in path.split(".") if part]


def _values_at_path(value: Any, parts: list[str]) -> list[Any]:
    if not parts:
        return [value]
    if value is MISSING:
        return []

    part = parts[0]
    rest = parts[1:]

    if isinstance(value, list):
        out: list[Any] = []
        for item in value:
            out.extend(_values_at_path(item, parts))
        return out

    if isinstance(value, dict):
        if part in value:
            return _values_at_path(value[part], rest)
        return []

    return []


def _set_path(doc: dict[str, Any], path: str, value: Any) -> None:
    parts = _split_path(path)
    if not parts:
        return
    current: Any = doc
    for part in parts[:-1]:
        if not isinstance(current, dict):
            return
        nxt = current.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            current[part] = nxt
        current = nxt
    if isinstance(current, dict):
        current[parts[-1]] = value


def _unset_path(doc: dict[str, Any], path: str) -> None:
    parts = _split_path(path)
    if not parts:
        return
    current: Any = doc
    for part in parts[:-1]:
        if not isinstance(current, dict) or part not in current:
            return
        current = current[part]
    if isinstance(current, dict):
        current.pop(parts[-1], None)


def _any_equals(values: list[Any], expected: Any) -> bool:
    for value in values:
        if value == expected:
            return True
    return False


def _compile_regex(pattern: Any, options: str) -> re.Pattern[str]:
    flags = 0
    if "i" in options:
        flags |= re.IGNORECASE
    return re.compile(str(pattern), flags)


def _matches_field_condition(doc: dict[str, Any], field: str, condition: Any) -> bool:
    values = _values_at_path(doc, _split_path(field))
    exists = len(values) > 0

    if not isinstance(condition, dict) or all(not str(k).startswith("$") for k in condition.keys()):
        return _any_equals(values, condition)

    for op, expected in condition.items():
        if op == "$exists":
            if bool(expected) != exists:
                return False
            continue

        if op == "$regex":
            pattern = _compile_regex(expected, str(condition.get("$options", "")))
            if not any(pattern.search(str(v)) for v in values if v is not None):
                return False
            continue

        if op == "$options":
            continue

        if op == "$in":
            if not any(v in expected for v in values):
                return False
            continue

        if op == "$nin":
            if any(v in expected for v in values):
                return False
            continue

        if op == "$ne":
            if _any_equals(values, expected):
                return False
            continue

        if op == "$gt":
            if not any(v is not None and v > expected for v in values):
                return False
            continue

        if op == "$gte":
            if not any(v is not None and v >= expected for v in values):
                return False
            continue

        if op == "$lt":
            if not any(v is not None and v < expected for v in values):
                return False
            continue

        if op == "$lte":
            if not any(v is not None and v <= expected for v in values):
                return False
            continue

        if op == "$elemMatch":
            matched = False
            for value in values:
                if isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict) and _matches_filter(item, expected):
                            matched = True
                            break
                        if not isinstance(item, dict) and item == expected:
                            matched = True
                            break
                if matched:
                    break
            if not matched:
                return False
            continue

        if op == "$not":
            if _matches_field_condition(doc, field, expected):
                return False
            continue

        return False

    return True


def _matches_filter(doc: dict[str, Any], query: Optional[dict[str, Any]]) -> bool:
    if not query:
        return True

    for key, value in query.items():
        if key == "$or":
            if not any(_matches_filter(doc, subq) for subq in value):
                return False
            continue
        if key == "$and":
            if not all(_matches_filter(doc, subq) for subq in value):
                return False
            continue
        if key == "$nor":
            if any(_matches_filter(doc, subq) for subq in value):
                return False
            continue
        if key.startswith("$"):
            return False
        if not _matches_field_condition(doc, key, value):
            return False

    return True


def _project_document(doc: dict[str, Any], projection: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not projection:
        out = dict(doc)
        out.pop("_id", None)
        return out

    include_fields = [k for k, v in projection.items() if v and k != "_id"]
    exclude_fields = [k for k, v in projection.items() if not v and k != "_id"]

    if include_fields:
        out: dict[str, Any] = {}
        for field in include_fields:
            values = _values_at_path(doc, _split_path(field))
            if values:
                _set_path(out, field, values[0])
        return out

    out = dict(doc)
    for field in exclude_fields:
        _unset_path(out, field)
    out.pop("_id", None)
    return out


def _sort_key_from_doc(doc: dict[str, Any], field: str) -> Any:
    values = _values_at_path(doc, _split_path(field))
    if not values:
        return None
    return values[0]


def _apply_update(doc: dict[str, Any], update: dict[str, Any]) -> dict[str, Any]:
    new_doc = dict(doc)

    if not any(k.startswith("$") for k in update.keys()):
        replacement = dict(update)
        replacement["id"] = replacement.get("id") or new_doc.get("id") or str(uuid.uuid4())
        replacement["created_at"] = replacement.get("created_at") or new_doc.get("created_at") or _now_iso()
        return replacement

    for op, payload in update.items():
        if op == "$set":
            for path, value in payload.items():
                _set_path(new_doc, path, value)
            continue

        if op == "$inc":
            for path, value in payload.items():
                current_values = _values_at_path(new_doc, _split_path(path))
                current = current_values[0] if current_values else 0
                if current is None:
                    current = 0
                if isinstance(current, Decimal) and not isinstance(value, Decimal):
                    value = Decimal(str(value))
                elif isinstance(value, Decimal) and not isinstance(current, Decimal):
                    current = Decimal(str(current))
                _set_path(new_doc, path, current + value)
            continue

        if op == "$unset":
            for path in payload.keys():
                _unset_path(new_doc, path)
            continue

        if op == "$push":
            for path, value in payload.items():
                current_values = _values_at_path(new_doc, _split_path(path))
                arr = list(current_values[0]) if current_values and isinstance(current_values[0], list) else []
                if isinstance(value, dict) and "$each" in value:
                    arr.extend(list(value.get("$each") or []))
                else:
                    arr.append(value)
                _set_path(new_doc, path, arr)
            continue

        if op == "$pull":
            for path, value in payload.items():
                current_values = _values_at_path(new_doc, _split_path(path))
                arr = list(current_values[0]) if current_values and isinstance(current_values[0], list) else []
                if isinstance(value, dict):
                    filtered = [item for item in arr if not (isinstance(item, dict) and _matches_filter(item, value))]
                else:
                    filtered = [item for item in arr if item != value]
                _set_path(new_doc, path, filtered)
            continue

    return new_doc


def _extract_group_key(doc: dict[str, Any], expr: Any) -> Any:
    if expr is None:
        return None
    if isinstance(expr, str) and expr.startswith("$"):
        values = _values_at_path(doc, _split_path(expr[1:]))
        return values[0] if values else None
    return expr


def _resolve_expr(doc: dict[str, Any], expr: Any) -> Any:
    if isinstance(expr, str) and expr.startswith("$"):
        values = _values_at_path(doc, _split_path(expr[1:]))
        return values[0] if values else None
    if isinstance(expr, dict):
        return {k: _resolve_expr(doc, v) for k, v in expr.items()}
    return expr


class AsyncPGCursor:
    def __init__(self, collection: "AsyncPGCollection", query: Optional[dict[str, Any]], projection: Optional[dict[str, Any]]):
        self.collection = collection
        self.query = query or {}
        self.projection = projection
        self._sorts: list[tuple[str, int]] = []
        self._skip = 0
        self._limit: Optional[int] = None
        self._iter_docs: Optional[list[dict[str, Any]]] = None
        self._iter_index = 0

    def sort(self, key_or_list: Any, direction: Optional[int] = None) -> "AsyncPGCursor":
        if isinstance(key_or_list, list):
            self._sorts = [(str(k), int(v)) for k, v in key_or_list]
        else:
            self._sorts = [(str(key_or_list), int(direction or 1))]
        return self

    def skip(self, count: int) -> "AsyncPGCursor":
        self._skip = max(0, int(count))
        return self

    def limit(self, count: int) -> "AsyncPGCursor":
        self._limit = max(0, int(count))
        return self

    async def _materialize(self) -> list[dict[str, Any]]:
        docs = await self.collection._find_docs(self.query)
        for field, direction in reversed(self._sorts):
            reverse = int(direction) < 0
            docs.sort(key=lambda item, sort_field=field: _sort_key_from_doc(item, sort_field), reverse=reverse)

        if self._skip:
            docs = docs[self._skip :]

        if self._limit is not None:
            docs = docs[: self._limit]

        return [_project_document(doc, self.projection) for doc in docs]

    async def to_list(self, length: Optional[int] = None) -> list[dict[str, Any]]:
        docs = await self._materialize()
        if length is None:
            return docs
        return docs[: max(0, int(length))]

    async def __anext__(self) -> dict[str, Any]:
        if self._iter_docs is None:
            self._iter_docs = await self._materialize()
            self._iter_index = 0
        if self._iter_index >= len(self._iter_docs):
            raise StopAsyncIteration
        item = self._iter_docs[self._iter_index]
        self._iter_index += 1
        return item

    def __aiter__(self) -> "AsyncPGCursor":
        self._iter_docs = None
        self._iter_index = 0
        return self


class AsyncPGAggregateCursor:
    def __init__(self, collection: "AsyncPGCollection", pipeline: list[dict[str, Any]]):
        self.collection = collection
        self.pipeline = pipeline
        self._docs: Optional[list[dict[str, Any]]] = None
        self._index = 0

    async def _ensure_docs(self) -> list[dict[str, Any]]:
        if self._docs is None:
            self._docs = await self.collection._aggregate_docs(self.pipeline)
        return self._docs

    async def to_list(self, length: Optional[int] = None) -> list[dict[str, Any]]:
        docs = list(await self._ensure_docs())
        if length is None:
            return docs
        return docs[: max(0, int(length))]

    def __aiter__(self) -> "AsyncPGAggregateCursor":
        self._index = 0
        return self

    async def __anext__(self) -> dict[str, Any]:
        docs = await self._ensure_docs()
        if self._index >= len(docs):
            raise StopAsyncIteration
        item = docs[self._index]
        self._index += 1
        return item


class AsyncPGCollection:
    def __init__(self, database: "AsyncPGDatabase", name: str):
        self.database = database
        self.name = name

    def _is_minimal_mode(self) -> bool:
        return self.database.adapter.compat_mode == "minimal"

    def _ensure_minimal_update(self, update: dict[str, Any]) -> None:
        if not self._is_minimal_mode():
            return
        if not any(k.startswith("$") for k in update.keys()):
            return
        unsupported = [k for k in update.keys() if k not in {"$set"}]
        if unsupported:
            raise RuntimeError(
                f"Compatibility adapter minimal mode only supports $set updates. Unsupported operators: {', '.join(unsupported)}"
            )

    async def create_index(self, keys: Any, unique: bool = False) -> str:
        # Native indexes are maintained by SQL schema migrations.
        _ = keys
        _ = unique
        await asyncio.sleep(0)
        return f"noop_{self.name}_index"

    def find(self, query: Optional[dict[str, Any]] = None, projection: Optional[dict[str, Any]] = None) -> AsyncPGCursor:
        return AsyncPGCursor(self, query, projection)

    async def find_one(self, query: Optional[dict[str, Any]] = None, projection: Optional[dict[str, Any]] = None) -> Optional[dict[str, Any]]:
        docs = await self.find(query, projection).limit(1).to_list(1)
        return docs[0] if docs else None

    async def insert_one(self, doc: dict[str, Any]) -> InsertOneResult:
        payload = dict(doc)
        payload.pop("_id", None)
        if not payload.get("id"):
            payload["id"] = str(uuid.uuid4())
        if "created_at" not in payload:
            payload["created_at"] = _now_iso()
        await self.database._run_sync(self.database._insert_doc_sync, self.name, payload)
        return InsertOneResult(inserted_id=payload["id"])

    async def update_one(self, query: dict[str, Any], update: dict[str, Any], upsert: bool = False) -> UpdateResult:
        self._ensure_minimal_update(update)
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0)
            base_doc = {}
            for key, value in query.items():
                if not key.startswith("$") and not isinstance(value, dict):
                    _set_path(base_doc, key, value)
            updated = _apply_update(base_doc, update)
            if "id" not in updated:
                updated["id"] = str(uuid.uuid4())
            if "created_at" not in updated:
                updated["created_at"] = _now_iso()
            await self.database._run_sync(self.database._insert_doc_sync, self.name, updated)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=updated.get("id"))

        original = docs[0]
        updated = _apply_update(original, update)
        if updated != original:
            updated["updated_at"] = updated.get("updated_at") or _now_iso()
            await self.database._run_sync(self.database._replace_doc_sync, self.name, original, updated)
            return UpdateResult(matched_count=1, modified_count=1)
        return UpdateResult(matched_count=1, modified_count=0)

    async def update_many(self, query: dict[str, Any], update: dict[str, Any], upsert: bool = False) -> UpdateResult:
        self._ensure_minimal_update(update)
        docs = await self._find_docs(query)
        if not docs:
            if upsert:
                one = await self.update_one(query, update, upsert=True)
                return UpdateResult(matched_count=0, modified_count=one.modified_count, upserted_id=one.upserted_id)
            return UpdateResult(matched_count=0, modified_count=0)

        modified = 0
        for original in docs:
            updated = _apply_update(original, update)
            if updated != original:
                updated["updated_at"] = updated.get("updated_at") or _now_iso()
                await self.database._run_sync(self.database._replace_doc_sync, self.name, original, updated)
                modified += 1
        return UpdateResult(matched_count=len(docs), modified_count=modified)

    async def delete_one(self, query: dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        await self.database._run_sync(self.database._delete_doc_sync, self.name, docs[0])
        return DeleteResult(deleted_count=1)

    async def delete_many(self, query: dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        deleted = 0
        for doc in docs:
            await self.database._run_sync(self.database._delete_doc_sync, self.name, doc)
            deleted += 1
        return DeleteResult(deleted_count=deleted)

    async def count_documents(self, query: Optional[dict[str, Any]] = None) -> int:
        docs = await self._find_docs(query)
        return len(docs)

    async def distinct(self, key: str, query: Optional[dict[str, Any]] = None) -> list[Any]:
        if self._is_minimal_mode():
            raise RuntimeError("Compatibility adapter minimal mode does not support distinct().")
        docs = await self._find_docs(query)
        seen: list[Any] = []
        for doc in docs:
            values = _values_at_path(doc, _split_path(key))
            for value in values:
                if value not in seen:
                    seen.append(value)
        return seen

    def aggregate(self, pipeline: list[dict[str, Any]]) -> AsyncPGAggregateCursor:
        if self._is_minimal_mode():
            raise RuntimeError("Compatibility adapter minimal mode does not support aggregate().")
        return AsyncPGAggregateCursor(self, pipeline)

    async def _aggregate_docs(self, pipeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
        docs = await self._find_docs({})
        working = docs

        for stage in pipeline:
            if "$match" in stage:
                working = [doc for doc in working if _matches_filter(doc, stage["$match"])]
                continue

            if "$group" in stage:
                spec = stage["$group"]
                grouped: dict[Any, dict[str, Any]] = {}
                for doc in working:
                    key = _extract_group_key(doc, spec.get("_id"))
                    if key not in grouped:
                        grouped[key] = {"_id": key}
                    row = grouped[key]
                    for out_field, expr in spec.items():
                        if out_field == "_id":
                            continue
                        if isinstance(expr, dict) and "$sum" in expr:
                            row[out_field] = row.get(out_field, 0) + (_resolve_expr(doc, expr["$sum"]) or 0)
                            continue
                        if isinstance(expr, dict) and "$push" in expr:
                            row.setdefault(out_field, []).append(_resolve_expr(doc, expr["$push"]))
                            continue
                working = list(grouped.values())
                continue

            if "$sort" in stage:
                spec = stage["$sort"]
                for field, direction in reversed(list(spec.items())):
                    reverse = int(direction) < 0
                    working.sort(key=lambda item, sort_field=field: _sort_key_from_doc(item, sort_field), reverse=reverse)
                continue

            if "$limit" in stage:
                working = working[: int(stage["$limit"])]
                continue

            if "$project" in stage:
                projected: list[dict[str, Any]] = []
                for doc in working:
                    out: dict[str, Any] = {}
                    for key, expr in stage["$project"].items():
                        if key == "_id" and not expr:
                            continue
                        if expr == 1:
                            out[key] = doc.get(key)
                        else:
                            out[key] = _resolve_expr(doc, expr)
                    projected.append(out)
                working = projected
                continue

        return working

    async def _find_docs(self, query: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
        docs = await self.database._run_sync(self.database._load_all_docs_sync, self.name)
        return [doc for doc in docs if _matches_filter(doc, query)]


class AsyncPGDatabase:
    def __init__(self, adapter: "PostgresMongoAdapter"):
        self.adapter = adapter

    def __getitem__(self, collection_name: str) -> AsyncPGCollection:
        return AsyncPGCollection(self, collection_name)

    def __getattr__(self, collection_name: str) -> AsyncPGCollection:
        return self[collection_name]

    async def list_collection_names(self) -> list[str]:
        return await self._run_sync(self._list_collection_names_sync)

    async def _run_sync(self, fn: Any, *args: Any) -> Any:
        return await asyncio.to_thread(fn, *args)

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self.adapter.dsn, row_factory=dict_row)

    def _list_collection_names_sync(self) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = %s AND table_type = 'BASE TABLE'
                """,
                (self.adapter.schema,),
            ).fetchall()
        return sorted([row["table_name"] for row in rows])

    def _load_table_metadata_sync(self, table_name: str) -> dict[str, Any]:
        cache_key = f"{self.adapter.schema}.{table_name}"
        cached = self.adapter._table_cache.get(cache_key)
        if cached is not None:
            return cached

        with self._connect() as conn:
            col_rows = conn.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position
                """,
                (self.adapter.schema, table_name),
            ).fetchall()
            if not col_rows:
                raise RuntimeError(f"Table not found for collection '{table_name}' in schema '{self.adapter.schema}'")

            pk_rows = conn.execute(
                """
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.table_schema = %s
                  AND tc.table_name = %s
                  AND tc.constraint_type = 'PRIMARY KEY'
                ORDER BY kcu.ordinal_position
                """,
                (self.adapter.schema, table_name),
            ).fetchall()

        metadata = {
            "columns": [row["column_name"] for row in col_rows],
            "pk_columns": [row["column_name"] for row in pk_rows] or ["id"],
        }
        self.adapter._table_cache[cache_key] = metadata
        return metadata

    def _hydrate_doc(self, row: dict[str, Any], columns: list[str]) -> dict[str, Any]:
        payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        doc: dict[str, Any] = dict(payload)
        for col in columns:
            if col == "payload":
                continue
            doc[col] = _to_json_compatible(row.get(col))
        doc.pop("_id", None)
        return doc

    def _row_from_doc(self, doc: dict[str, Any], columns: list[str]) -> dict[str, Any]:
        row: dict[str, Any] = {}
        column_set = set(columns)
        for col in columns:
            if col == "payload":
                continue
            if col in doc:
                row[col] = doc[col]

        extras = {k: v for k, v in doc.items() if k not in column_set and k != "_id"}
        if "payload" in column_set:
            row["payload"] = extras
        return row

    def _sql_ident(self, ident: str) -> str:
        return '"' + ident.replace('"', '""') + '"'

    def _qualified_table(self, table_name: str) -> str:
        return f"{self._sql_ident(self.adapter.schema)}.{self._sql_ident(table_name)}"

    def _load_all_docs_sync(self, table_name: str) -> list[dict[str, Any]]:
        metadata = self._load_table_metadata_sync(table_name)
        with self._connect() as conn:
            rows = conn.execute(f"SELECT * FROM {self._qualified_table(table_name)}").fetchall()
        return [self._hydrate_doc(row, metadata["columns"]) for row in rows]

    def _insert_doc_sync(self, table_name: str, doc: dict[str, Any]) -> None:
        metadata = self._load_table_metadata_sync(table_name)
        columns = metadata["columns"]
        row = self._row_from_doc(doc, columns)
        if "id" in columns and not row.get("id"):
            row["id"] = str(uuid.uuid4())
        if "created_at" in columns and "created_at" not in row:
            row["created_at"] = _now_iso()

        insert_cols = [col for col in columns if col in row]
        values: list[Any] = []
        for col in insert_cols:
            value = row[col]
            if col == "payload":
                value = Jsonb(_to_json_compatible(value or {}))
            values.append(value)

        placeholders = ", ".join(["%s"] * len(insert_cols))
        sql = (
            f"INSERT INTO {self._qualified_table(table_name)} "
            f"({', '.join(self._sql_ident(col) for col in insert_cols)}) "
            f"VALUES ({placeholders})"
        )
        with self._connect() as conn:
            conn.execute(sql, values)
            conn.commit()

    def _replace_doc_sync(self, table_name: str, original_doc: dict[str, Any], updated_doc: dict[str, Any]) -> None:
        metadata = self._load_table_metadata_sync(table_name)
        columns = metadata["columns"]
        pk_columns = metadata["pk_columns"]
        row = self._row_from_doc(updated_doc, columns)
        if "updated_at" in columns and "updated_at" not in row:
            row["updated_at"] = _now_iso()

        set_cols = [col for col in columns if col in row and col not in pk_columns]
        if not set_cols:
            return

        set_clause = ", ".join([f"{self._sql_ident(col)} = %s" for col in set_cols])
        where_clause = " AND ".join([f"{self._sql_ident(col)} = %s" for col in pk_columns])

        values: list[Any] = []
        for col in set_cols:
            value = row[col]
            if col == "payload":
                value = Jsonb(_to_json_compatible(value or {}))
            values.append(value)

        for col in pk_columns:
            values.append(original_doc.get(col))

        sql = f"UPDATE {self._qualified_table(table_name)} SET {set_clause} WHERE {where_clause}"
        with self._connect() as conn:
            conn.execute(sql, values)
            conn.commit()

    def _delete_doc_sync(self, table_name: str, doc: dict[str, Any]) -> None:
        metadata = self._load_table_metadata_sync(table_name)
        pk_columns = metadata["pk_columns"]
        where_clause = " AND ".join([f"{self._sql_ident(col)} = %s" for col in pk_columns])
        params = [doc.get(col) for col in pk_columns]
        sql = f"DELETE FROM {self._qualified_table(table_name)} WHERE {where_clause}"
        with self._connect() as conn:
            conn.execute(sql, params)
            conn.commit()


class PostgresMongoAdapter:
    def __init__(self):
        self.dsn = get_native_pg_dsn()
        self.schema = os.environ.get("PG_NATIVE_SCHEMA", "native_app")
        self.compat_mode = os.environ.get("PG_COMPAT_MODE", "full").strip().lower()
        self._table_cache: dict[str, dict[str, Any]] = {}
        self._db = AsyncPGDatabase(self)
        apply_native_schema()

    def get_db(self) -> AsyncPGDatabase:
        return self._db
