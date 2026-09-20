"""Vercel endpoint that compares a newly submitted SI/BL pair.

The browser only sends an inbox record ID. This function uses the Supabase
service-role key held by Vercel to read the private attachments and persist a
deterministic result, so no privileged key is exposed to the client.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
import zipfile
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

from pypdf import PdfReader


FIELDS = (
    "shipper", "consignee", "notify_party", "port_of_loading",
    "port_of_discharge", "container_count", "gross_weight_kg",
)
FIELD_LABELS = {
    "shipper": "Shipper", "consignee": "Consignee", "notify_party": "Notify Party",
    "port_of_loading": "Port of Loading", "port_of_discharge": "Port of Discharge",
    "container_count": "Container Count", "gross_weight_kg": "Gross Weight",
}
LABELS = {
    "shipper": (r"shipper(?:\s*/\s*exporter)?", r"exporter", r"seller"),
    "consignee": (r"consignee", r"to\s+the\s+order\s+of", r"buyer"),
    "notify_party": (r"notify(?:\s+party)?",),
    "port_of_loading": (r"port\s+of\s+loading", r"load(?:ing)?\s+port", r"pol"),
    "port_of_discharge": (r"port\s+of\s+discharge", r"discharge\s+port", r"pod"),
    "container_count": (r"container\s+count", r"no\.?(?:\s+of)?\s+containers?(?:\s+or\s+packages)?", r"total\s+containers?", r"containers?"),
    "gross_weight_kg": (r"gross\s*(?:weight|wt)(?:\s*\(?kgs?\)?)?",),
}
SINGLE_LINE_FIELDS = {"port_of_loading", "port_of_discharge", "container_count", "gross_weight_kg"}
OTHER_LABELS = (
    r"vessel(?:\s+name)?", r"ocean\s+vessel", r"export\s+carrier", r"commodity",
    r"description", r"hs\s+code", r"booking\s+no\.?", r"b/l\s+n(?:o|umber)\.?",
    r"container\s+no\.?", r"freight", r"order\s+no\.?", r"place\s+of\s+(?:receipt|delivery)",
    r"marks(?:\s+and\s+numbers)?", r"seal\s+no\.?")
BLANK_RUN_RE = re.compile(r"\?{2,}|_{3,}")
PLACEHOLDER_RE = re.compile(r"^(?:tba|tbc|t\.b\.a\.?|n/?a|nil|none|-+|\.+)$", re.I)


def configured() -> tuple[str, str]:
    url, key = os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("Comparison service is missing its Supabase server configuration")
    return url, key


def request(method: str, path: str, *, payload: Any | None = None, params: str = "") -> Any:
    url, key = configured()
    data = json.dumps(payload).encode() if payload is not None else None
    req = Request(f"{url}{path}{params}", data=data, method=method, headers={
        "apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
    })
    with urlopen(req, timeout=30) as response:
        raw = response.read()
    return json.loads(raw) if raw else None


def download(path: str) -> bytes:
    url, key = configured()
    req = Request(
        f"{url}/storage/v1/object/case-attachments/{quote(path, safe='/')}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urlopen(req, timeout=30) as response:
        return response.read()


def extract_docx(data: bytes) -> str:
    from xml.etree import ElementTree
    with zipfile.ZipFile(BytesIO(data)) as archive:
        root = ElementTree.fromstring(archive.read("word/document.xml"))
    return "\n".join("".join(node.itertext()) for node in root.iter() if node.tag.endswith("}p"))


def extract_xlsx(data: bytes) -> str:
    from xml.etree import ElementTree
    with zipfile.ZipFile(BytesIO(data)) as archive:
        shared: list[str] = []
        try:
            root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(item.itertext()) for item in root if item.tag.endswith("}si")]
        except KeyError:
            pass
        rows: list[str] = []
        for name in archive.namelist():
            if not re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name):
                continue
            for row in ElementTree.fromstring(archive.read(name)).iter():
                if not row.tag.endswith("}row"):
                    continue
                values = []
                for cell in row:
                    if not cell.tag.endswith("}c"):
                        continue
                    value = next((node.text for node in cell if node.tag.endswith("}v")), "") or ""
                    if cell.attrib.get("t") == "s" and value.isdigit():
                        value = shared[int(value)]
                    elif cell.attrib.get("t") == "inlineStr":
                        value = "".join(node.text or "" for node in cell.iter() if node.tag.endswith("}t"))
                    values.append(value)
                rows.append(": ".join(values) if len(values) == 2 else " ".join(values))
    return "\n".join(rows)


def attachment_text(path: str) -> str | None:
    data = download(path)
    suffix = Path(path).suffix.casefold()
    if suffix in (".txt", ".csv"):
        text = data.decode("utf-8", errors="replace")
    elif suffix == ".docx":
        text = extract_docx(data)
    elif suffix == ".xlsx":
        text = extract_xlsx(data)
    elif suffix == ".pdf":
        text = "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(data)).pages)
    else:
        return None
    return text if text.strip() else None


def missing(value: str | None) -> bool:
    return not value or bool(BLANK_RUN_RE.search(value)) or bool(PLACEHOLDER_RE.match(value.strip()))


def strip_gloss(line: str) -> str:
    """Make PDF/DOCX table labels comparable after text extraction."""
    line = re.sub(r"\([^)]*\)", " ", line)
    line = re.sub(r"[^\x00-\x7f]+", " ", line)
    return re.sub(r"[\s:\-–]+$", "", line.strip())


def label_line(line: str) -> bool:
    normalized = strip_gloss(line)
    patterns = [pattern for aliases in LABELS.values() for pattern in aliases] + list(OTHER_LABELS)
    return any(re.fullmatch(rf"(?:total|grand\s+total|no\.?\s+of|number\s+of)?\s*(?:{pattern})(?:\s*/\s*[\w ]+)?", normalized, re.I) for pattern in patterns)


def extract_fields(text: str) -> dict[str, str | None]:
    values: dict[str, str | None] = {}
    inline_fields: set[str] = set()
    for field, labels in LABELS.items():
        value = None
        for label in labels:
            match = re.search(rf"(?im)^\s*(?:{label})(?:\s*\([^\r\n)]*\))?\s*[:\-–]\s*([^\r\n]*)", text)
            if match:
                value = match.group(1).strip()
                inline_fields.add(field)
                break
        values[field] = value

    # PDF/DOCX table extraction commonly returns a label on one line and its
    # value on the following line. Use that form only when the inline form was
    # absent, never by guessing across another label boundary.
    lines = text.splitlines()
    for field, labels in LABELS.items():
        if field in inline_fields or not missing(values[field]):
            continue
        for index, raw_line in enumerate(lines):
            line = strip_gloss(raw_line)
            if not any(re.fullmatch(rf"(?:total|grand\s+total|no\.?\s+of|number\s+of)?\s*(?:{label})(?:\s*/\s*[\w ]+)?", line, re.I) for label in labels):
                continue
            collected: list[str] = []
            for following in lines[index + 1:]:
                if not following.strip() or label_line(following):
                    break
                collected.append(following.strip())
                if field in SINGLE_LINE_FIELDS:
                    break
            if collected:
                candidate = " ".join(collected)
                if (field in SINGLE_LINE_FIELDS and not re.search(r"\d", candidate)) or (field not in SINGLE_LINE_FIELDS and re.fullmatch(r"[\d,.\s]+", candidate)):
                    continue
                values[field] = candidate
                break
    return values


def normalise_text(value: str) -> str:
    return re.sub(r"[^\w]+", "", unicodedata.normalize("NFKD", value).casefold())


def normalise_number(value: str) -> str | None:
    match = re.search(r"\d[\d, .]*", value)
    if not match:
        return None
    try:
        number = Decimal(match.group(0).replace(" ", "").replace(",", ""))
        return str(int(number)) if number == number.to_integral() else format(number.normalize(), "f").rstrip("0").rstrip(".")
    except InvalidOperation:
        return None


def equal(field: str, si: str, bl: str) -> bool:
    return normalise_number(si) == normalise_number(bl) if field in ("container_count", "gross_weight_kg") else normalise_text(si) == normalise_text(bl)


def is_document(path: str, kind: str) -> bool:
    stem = Path(path).stem.casefold()
    words = ("si", "shipping_instruction") if kind == "si" else ("bl", "bill_of_lading")
    return any(re.search(rf"(?:^|[_\-\s]){word}(?:$|[_\-\s])", stem) for word in words)


def compare(attachments: list[dict[str, Any]]) -> dict[str, Any]:
    paths = [item.get("path") for item in attachments if isinstance(item, dict) and isinstance(item.get("path"), str)]
    si_paths, bl_paths = [path for path in paths if is_document(path, "si")], [path for path in paths if is_document(path, "bl")]
    if not si_paths or not bl_paths:
        return {"status": "NEEDS_REVIEW", "review_reason": "missing_attachment", "defect_fields": [], "field_comparison": []}
    si_text, bl_text = attachment_text(si_paths[0]), attachment_text(bl_paths[0])
    if not si_text or not bl_text:
        return {"status": "NEEDS_REVIEW", "review_reason": "unreadable", "defect_fields": [], "field_comparison": []}
    si, bl = extract_fields(si_text), extract_fields(bl_text)
    if any(missing(si[field]) or missing(bl[field]) for field in FIELDS):
        return {"status": "NEEDS_REVIEW", "review_reason": "missing_value", "defect_fields": [], "field_comparison": []}
    defects = [field for field in FIELDS if not equal(field, si[field], bl[field])]
    fields = [{"field": field, "label": FIELD_LABELS[field], "si_value": si[field], "bl_value": bl[field], "status": "mismatch" if field in defects else "match"} for field in FIELDS]
    return {"status": "MISMATCH" if defects else "OK", "review_reason": None, "defect_fields": defects, "field_comparison": fields}


class handler(BaseHTTPRequestHandler):
    def _json(self, status: int, body: Any) -> None:
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self) -> None:
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            email_id = body.get("email_id") if isinstance(body, dict) else None
            if not isinstance(email_id, str) or not email_id:
                raise ValueError("email_id is required")
            records = request("GET", "/rest/v1/inbox_records", params=f"?email_id=eq.{quote(email_id)}&select=attachments,category")
            if not records:
                self._json(404, {"error": "Case not found"})
                return
            record = records[0]
            if record.get("category") != "comparison_request":
                self._json(200, {"status": "not_applicable"})
                return
            result = compare(record.get("attachments") if isinstance(record.get("attachments"), list) else [])
            update = {**result, "has_defect": bool(result["defect_fields"]), "workflow_status": "classification_complete", "last_error": None, "pipeline_synced_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}
            request("PATCH", "/rest/v1/inbox_records", payload=update, params=f"?email_id=eq.{quote(email_id)}")
            if result["status"] == "NEEDS_REVIEW":
                request("POST", "/rest/v1/review_queue_items", payload={"email_id": email_id, "reason": result["review_reason"]}, params="?on_conflict=email_id")
            self._json(200, result)
        except ValueError as error:
            self._json(400, {"error": str(error)})
        except Exception as error:
            self._json(502, {"error": f"Comparison failed: {error}"})
