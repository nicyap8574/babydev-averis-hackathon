#!/usr/bin/env python3
"""Best-effort sync of pipeline.py's output into Supabase Postgres.

This is an additive persistence layer, not a replacement: pipeline.py keeps
writing submission.json unconditionally (that file is the scored contract),
and this module only ever runs afterwards, wrapped so that a missing/broken
Supabase project can never break a pipeline run. Configure via the same
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars the Supabase Edge Function
(supabase/functions/identify-document-request) already uses.

Talks to Supabase's PostgREST REST API directly via urllib, matching the
rest of this file's dependency-free style (see pipeline.py's provider calls) - no supabase-py, no .env loading.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# inbox_records.category (see supabase/migrations/*.sql) uses the Edge
# Function's snake_case vocabulary; pipeline.py's own categories are the
# BL_COMPARISON-style constants from LLM_LABELS's values. Translate rather
# than widen the CHECK constraint, since the Edge Function/tests already
# depend on it. Keep this in sync with scripts/evaluate-classifier.mjs's
# (inverse) categoryMap.
CATEGORY_TO_SUPABASE = {
    "BL_COMPARISON": "comparison_request",
    "SI_REQUEST": "new_si_request",
    "INVOICE_QUERY": "invoice_query",
    "GENERAL": "general_message",
    "SPAM": "spam",
}


def _configured() -> tuple[str, str] | None:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return None
    return url, key


def _request(method: str, url: str, key: str, path: str, *,
             body: object = None, params: dict[str, str] | None = None,
             extra_headers: dict[str, str] | None = None) -> object:
    query = ""
    if params:
        from urllib.parse import urlencode
        query = "?" + urlencode(params)
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        **(extra_headers or {}),
    }
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = Request(f"{url}/rest/v1/{path}{query}", data=data, headers=headers, method=method)
    with urlopen(request, timeout=30) as response:
        raw = response.read()
    return json.loads(raw) if raw else None


def upsert(table: str, rows: list[dict], on_conflict: str) -> None:
    configured = _configured()
    if not configured or not rows:
        return
    url, key = configured
    _request(
        "POST", url, key, table,
        body=rows,
        params={"on_conflict": on_conflict},
        extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )


def insert(table: str, rows: list[dict]) -> None:
    """Plain append, for tables with no natural conflict target (e.g. an
    audit log keyed by a server-generated uuid)."""
    configured = _configured()
    if not configured or not rows:
        return
    url, key = configured
    _request("POST", url, key, table, body=rows, extra_headers={"Prefer": "return=minimal"})


def select(table: str, params: dict[str, str] | None = None) -> list[dict]:
    configured = _configured()
    if not configured:
        return []
    url, key = configured
    try:
        result = _request("GET", url, key, table, params=params)
    except (HTTPError, URLError):
        return []
    return result or []


def sync_submission(emails: list[dict], rows: dict[str, dict]) -> None:
    """Upsert every email's classification + comparison verdict (including
    its precomputed field_comparison, see pipeline.py's _build_case_rows())
    into inbox_records, and seed review_queue_items for anything
    NEEDS_REVIEW. No-ops silently (returns immediately) if Supabase env vars
    aren't set."""
    if not _configured():
        return

    now = datetime.now(timezone.utc).isoformat()
    inbox_rows = []
    review_rows = []
    for email in emails:
        email_id = email["email_id"]
        result = rows.get(email_id)
        if result is None:
            continue
        inbox_rows.append({
            "email_id": email_id,
            "sender": email.get("from", ""),
            "subject": email.get("subject", ""),
            "body": email.get("body", ""),
            "attachments": email.get("attachments", []),
            "workflow_status": "classification_complete",
            "category": CATEGORY_TO_SUPABASE.get(result.get("category")),
            "status": result.get("status"),
            "review_reason": result.get("review_reason"),
            "has_defect": bool(result.get("has_defect")),
            "defect_fields": result.get("defect_fields", []),
            "field_comparison": result.get("field_comparison", []),
            "pipeline_synced_at": now,
        })
        if result.get("status") == "NEEDS_REVIEW":
            # Deliberately omit "resolved"/"resolution": the merge-duplicates
            # upsert below only overwrites columns present in the payload, so
            # a re-run of the pipeline can't clobber a human's resolution of
            # an item that was already worked on.
            review_rows.append({
                "email_id": email_id,
                "reason": result.get("review_reason"),
            })

    upsert("inbox_records", inbox_rows, on_conflict="email_id")
    upsert("review_queue_items", review_rows, on_conflict="email_id")
