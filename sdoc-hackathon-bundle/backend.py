#!/usr/bin/env python3
"""FastAPI server for the shipping document verification frontend.

Serves the pipeline's existing output (submission.json) and review queue
without re-running the pipeline. Run with:

    uvicorn backend:app --reload --port 8000
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from loader import Inbox
from pipeline import FIELDS, attachment_text, extract_fields, same_value

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = BASE_DIR / "submission.json"
REVIEW_QUEUE_PATH = BASE_DIR / "review_queue.json"
RESOLUTIONS_PATH = BASE_DIR / "review_resolutions.json"

FIELD_LABELS = {
    "shipper": "Shipper",
    "consignee": "Consignee",
    "notify_party": "Notify Party",
    "port_of_loading": "Port of Loading",
    "port_of_discharge": "Port of Discharge",
    "container_count": "Container Count",
    "gross_weight_kg": "Gross Weight",
}

app = FastAPI(title="Shipping Document Verification API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- in-memory state, populated on startup -----------------------------------
output: dict[str, dict] = {}
emails_by_id: dict[str, dict] = {}
review_queue: list[dict] = []
inbox: Inbox | None = None


def _build_review_queue() -> list[dict]:
    """Derive the review queue from submission.json when review_queue.json
    doesn't already exist on disk."""
    queue = []
    for email_id, result in output.items():
        if result.get("status") == "NEEDS_REVIEW":
            queue.append({
                "email_id": email_id,
                "subject": emails_by_id.get(email_id, {}).get("subject", ""),
                "reason": result.get("review_reason"),
                "resolved": False,
                "resolution": None,
            })
    return queue


@app.on_event("startup")
def load_state() -> None:
    global output, emails_by_id, review_queue, inbox

    output = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))

    inbox = Inbox(str(BASE_DIR))
    emails_by_id = {email["email_id"]: email for email in inbox}

    if REVIEW_QUEUE_PATH.exists():
        review_queue = json.loads(REVIEW_QUEUE_PATH.read_text(encoding="utf-8"))
    else:
        review_queue = _build_review_queue()


class ResolveRequest(BaseModel):
    resolution: str


@app.get("/emails")
def list_emails():
    results = []
    for email_id, result in output.items():
        email = emails_by_id.get(email_id, {})
        results.append({
            "id": email_id,
            "subject": email.get("subject", ""),
            "from": email.get("from", ""),
            "classification": result.get("category"),
            "status": result.get("status"),
            "mismatch_found": result.get("status") == "MISMATCH",
        })
    return results


@app.get("/emails/{email_id}")
def get_email(email_id: str):
    result = output.get(email_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Email not found")

    email = emails_by_id.get(email_id, {})
    fields = []
    defect_fields = set(result.get("defect_fields", []))

    if result.get("category") == "BL_COMPARISON" and inbox is not None:
        attachments = email.get("attachments", [])
        si_paths = [p for p in attachments if "_si" in Path(p).stem.casefold()]
        bl_paths = [p for p in attachments if "_bl" in Path(p).stem.casefold()]
        si_text = attachment_text(inbox, si_paths[0]) if si_paths else None
        bl_text = attachment_text(inbox, bl_paths[0]) if bl_paths else None

        if si_text is not None and bl_text is not None:
            si_values, bl_values = extract_fields(si_text), extract_fields(bl_text)
            for field in FIELDS:
                si_value, bl_value = si_values.get(field), bl_values.get(field)
                if si_value and bl_value:
                    status = "match" if same_value(field, si_value, bl_value) else "mismatch"
                else:
                    status = "mismatch"
                fields.append({
                    "field": field,
                    "label": FIELD_LABELS[field],
                    "si_value": si_value,
                    "bl_value": bl_value,
                    "status": status,
                })

    if not fields:
        for field in FIELDS:
            fields.append({
                "field": field,
                "label": FIELD_LABELS[field],
                "si_value": None,
                "bl_value": None,
                "status": "mismatch" if field in defect_fields else "match",
            })

    return {
        "id": email_id,
        "subject": email.get("subject", ""),
        "from": email.get("from", ""),
        "category": result.get("category"),
        "status": result.get("status"),
        "review_reason": result.get("review_reason"),
        "fields": fields,
        "mismatches": sorted(defect_fields),
    }


@app.get("/review-queue")
def get_review_queue():
    return review_queue


@app.post("/review-queue/{email_id}/resolve")
def resolve_review_item(email_id: str, body: ResolveRequest):
    item = next((entry for entry in review_queue if entry["email_id"] == email_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Email not in review queue")

    item["resolved"] = True
    item["resolution"] = body.resolution

    resolutions = []
    if RESOLUTIONS_PATH.exists():
        resolutions = json.loads(RESOLUTIONS_PATH.read_text(encoding="utf-8"))
    resolutions.append({"email_id": email_id, "resolution": body.resolution})
    RESOLUTIONS_PATH.write_text(json.dumps(resolutions, indent=2) + "\n", encoding="utf-8")

    return review_queue


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend:app", host="127.0.0.1", port=8000, reload=True)
