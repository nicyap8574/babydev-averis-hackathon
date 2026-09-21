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
# --- extract_fields() support -------------------------------------------------
# .docx and .pdf attachments render each field as a table cell, which flattens to
# the label on one line and its value on the next ("Port of Discharge (卸货港)\n
# BRISBANE, AUSTRALIA") instead of the "Label: value" form the .txt/.xlsx
# templates use. extract_fields() therefore runs two passes; these support the
# second one.

# A leading qualifier in front of the real label: "TOTAL Gross Weight (KG):
# 131,322" must still match the gross-weight label.
LABEL_QUALIFIER = r"(?:total|grand\s+total|no\.?\s+of|number\s+of)?\s*"
# A trailing "/..." on a label: "Notify Party/Intermediate Consignee".
LABEL_SUFFIX = r"(?:\s*/\s*[\w ]+)?"
# Labels that are not one of the 7 target fields but still terminate a value
# block in these templates - without them a port value runs on into the vessel
# name that follows it.
OTHER_LABELS = (r"vessel(?:\s+name)?", r"ocean\s+vessel", r"export\s+carrier",
                r"commodity", r"description", r"hs\s+code", r"booking\s+no\.?",
                r"b/l\s+n(?:o|umber)\.?", r"container\s+no\.?", r"freight",
                r"order\s+no\.?", r"place\s+of\s+(?:receipt|delivery)",
                r"marks(?:\s+and\s+numbers)?", r"seal\s+no\.?")
LABEL_LINE_RE = re.compile(
    r"(?i)^%s(?:%s)%s$" % (
        LABEL_QUALIFIER,
        "|".join([label for labels in LABELS.values() for label in labels] + list(OTHER_LABELS)),
        LABEL_SUFFIX,
    )
)
# Single-line fields. A port/count/weight value never spans lines, while a
# shipper/consignee/notify address usually does - collecting more than one line
# for these is what lets a port swallow the vessel block that follows it.
SINGLE_LINE_FIELDS = ("port_of_loading", "port_of_discharge",
                      "container_count", "gross_weight_kg")

# A run of blanking characters marks the value missing wherever it occurs, since
# templates pad placeholders with units ("____MT" in email_517/email_518).
BLANK_RUN_RE = re.compile(r"\?{2,}|_{3,}")
PLACEHOLDER_RE = re.compile(r"^(?:tba|tbc|t\.b\.a\.?|n/?a|nil|none|-+|\.+)$", re.I)
CLAIMS_ATTACHMENT_RE = re.compile(
    r"pleas\w*\s+(?:find|see)\s+(?:the\s+)?attach"
    r"|draft\s+bl\s+attached|is\s+attached"
    r"|attach\w*\s+(?:appear|seem)\w*\s+(?:to\s+have\s+been\s+)?(?:dropped|missing|lost)"
    r"|fail\w*\s+to\s+attach|didn'?t\s+attach|couldn'?t\s+attach|not\s+attached"
)


def configured() -> tuple[str, str]:
    url, key = os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("Comparison service is missing its Supabase server configuration")
    return url, key


def request(method: str, path: str, *, payload: Any | None = None, params: str = "", prefer: str = "") -> Any:
    url, key = configured()
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    req = Request(f"{url}{path}{params}", data=data, method=method, headers=headers)
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
    """Return readable document text, or None when it cannot be extracted.

    An unreadable attachment must escalate to NEEDS_REVIEW/unreadable, never
    raise: image-only and truncated PDFs are part of the corpus, and guessing
    at their contents would be worse than asking a human.
    """
    suffix = Path(path).suffix.casefold()
    try:
        data = download(path)
        if not data:
            return None
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
    except Exception:
        return None
    return text if text.strip() else None


def missing(value: str | None) -> bool:
    if value is None:
        return True
    value = value.strip()
    if not value:
        return True
    return bool(BLANK_RUN_RE.search(value)) or bool(PLACEHOLDER_RE.match(value))


def _match_inline_label(text: str, label: str) -> re.Match[str] | None:
    """Find a "Label: value" pair on a single line."""
    # Restrict the match to its line so that each label remains paired
    # with its value in text, spreadsheet, and Word renderings.
    # Some templates insert extra text between the label and its
    # separator (a CJK gloss, a "/Extra Words" suffix) that isn't
    # wrapped in parentheses; skip over parenthetical asides *or*
    # bare non-separator runs so the real separator still anchors.
    # Only horizontal whitespace is allowed in that gap - plain \s
    # matches newlines too, which would let the match wander onto a
    # later line and pair the label with an unrelated value. The
    # repetition is bounded (rather than unbounded '*') to avoid
    # catastrophic backtracking on lines with no real separator.
    # The captured value is '*' rather than '+' on purpose: a label with the
    # separator but nothing after it ("Shipper:") must still MATCH, so that
    # extract_fields records the label as seen and suppresses the block
    # fallback. With '+' the match failed entirely whenever the line had no
    # trailing whitespace, and the block reader then took the next line's text
    # as the shipper - the fabricated-value bug the blank guard exists to stop.
    return re.search(
        rf"(?im)^\s*{LABEL_QUALIFIER}(?:{label})(?:[ \t]*(?:\([^)\r\n]*\)|[^\r\n:\-\u2013()]+)){{0,5}}"
        rf"[ \t]*(?::|\-|\u2013)[ \t]*([^\r\n]*)",
        text,
    )


def _strip_gloss(line: str) -> str:
    """Reduce a label line to its bare label.

    Drops parenthetical asides and CJK glosses so that a table header like
    "Shipper (Principal or Seller) (发货人)" is recognisable as "Shipper".
    """
    line = re.sub(r"\([^)]*\)", " ", line)
    line = re.sub(r"[^\x00-\x7F]+", " ", line)
    return re.sub(r"[\s:\-\u2013]+$", "", line.strip()).strip()


def _match_block_label(lines: list[str], label: str, single_line: bool) -> str | None:
    """Find a value on the line(s) *below* a label that sits alone on its own line."""
    label_re = re.compile(rf"(?i)^{LABEL_QUALIFIER}(?:{label}){LABEL_SUFFIX}$")
    for index, line in enumerate(lines):
        if not label_re.match(_strip_gloss(line)):
            continue
        collected: list[str] = []
        for following in lines[index + 1:]:
            stripped = _strip_gloss(following)
            if not stripped or LABEL_LINE_RE.match(stripped):
                break
            collected.append(following.strip())
            if single_line:
                break
        if collected:
            return " ".join(collected)
    return None


def extract_fields(text: str) -> dict[str, str | None]:
    lines = text.splitlines()
    values: dict[str, str | None] = {}
    inline_labels: set[str] = set()

    # Pass 1 - the "Label: value" form used by the .txt and .xlsx templates.
    for field, labels in LABELS.items():
        value = None
        for label in labels:
            match = _match_inline_label(text, label)
            if match:
                value = match.group(1).strip()
                inline_labels.add(field)
                break
        values[field] = value

    # Pass 2 - the label-above-value form used by the .docx/.pdf table layouts,
    # for fields pass 1 could not resolve.
    for field, labels in LABELS.items():
        # A label that DID appear in "Label: value" form but with a blank or
        # placeholder value is genuinely missing, and must escalate as such. If
        # the block reader ran here it would walk onto the *next* line and pair
        # the label with an unrelated value - a bare "SHIPPER: " in
        # email_519_SI.txt otherwise takes the consignee below it and turns a
        # correct missing_value escalation into a fabricated 4-field mismatch.
        if field in inline_labels or not missing(values[field]):
            continue
        for label in labels:
            value = _match_block_label(lines, label, field in SINGLE_LINE_FIELDS)
            if value is None:
                continue
            numeric = field in ("container_count", "gross_weight_kg")
            # A count/weight always contains a digit; a party/port name is never
            # bare digits. These reject a table header that happens to sit above
            # an unrelated column of values.
            if numeric and not re.search(r"\d", value):
                continue
            if not numeric and re.fullmatch(r"[\d,.\s]+", value):
                continue
            values[field] = value
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


def compare(attachments: list[dict[str, Any]], subject: str = "", body: str = "") -> dict[str, Any]:
    paths = [item.get("path") for item in attachments if isinstance(item, dict) and isinstance(item.get("path"), str)]
    si_paths, bl_paths = [path for path in paths if is_document(path, "si")], [path for path in paths if is_document(path, "bl")]

    # Requests for a draft that has not yet been attached are not comparisons.
    # Every inbox email carries a boilerplate security disclaimer mentioning
    # "attachments", so a bare "attach" substring check false-positives on
    # every attachment-less email; require an actual attach-intent phrase.
    if not si_paths and not bl_paths:
        if CLAIMS_ATTACHMENT_RE.search(f"{subject}\n{body}".casefold()) or "enclosed" in f"{subject}\n{body}".casefold():
            return {"status": "NEEDS_REVIEW", "review_reason": "missing_attachment", "defect_fields": [], "field_comparison": []}
        return {"status": "OK", "review_reason": None, "defect_fields": [], "field_comparison": []}
    if not si_paths or not bl_paths:
        return {"status": "NEEDS_REVIEW", "review_reason": "missing_attachment", "defect_fields": [], "field_comparison": []}
    si_text, bl_text = attachment_text(si_paths[0]), attachment_text(bl_paths[0])
    if not si_text or not bl_text:
        return {"status": "NEEDS_REVIEW", "review_reason": "unreadable", "defect_fields": [], "field_comparison": []}

    # This dataset also titles SI documents "BL Instruction" or "Bill of Lading
    # Instruction" (industry synonyms for the shipping-instruction document).
    si_low = si_text.casefold()
    si_ok = "shipping instruction" in si_low or "bl instruction" in si_low or "bill of lading instruction" in si_low
    if not si_ok or "bill of lading" not in bl_text.casefold():
        return {"status": "NEEDS_REVIEW", "review_reason": "wrong_doc_type", "defect_fields": [], "field_comparison": []}

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
            records = request("GET", "/rest/v1/inbox_records", params=f"?email_id=eq.{quote(email_id)}&select=attachments,category,subject,body")
            if not records:
                self._json(404, {"error": "Case not found"})
                return
            record = records[0]
            if record.get("category") != "comparison_request":
                self._json(200, {"status": "not_applicable"})
                return
            result = compare(
                record.get("attachments") if isinstance(record.get("attachments"), list) else [],
                record.get("subject") or "",
                record.get("body") or "",
            )
            update = {**result, "has_defect": bool(result["defect_fields"]), "workflow_status": "classification_complete", "last_error": None, "pipeline_synced_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}
            request("PATCH", "/rest/v1/inbox_records", payload=update, params=f"?email_id=eq.{quote(email_id)}")
            if result["status"] == "NEEDS_REVIEW":
                # Only email_id and reason are written so a reviewer's existing
                # resolved/resolution survives a re-run of the same case.
                request("POST", "/rest/v1/review_queue_items", payload={"email_id": email_id, "reason": result["review_reason"]}, params="?on_conflict=email_id", prefer="resolution=merge-duplicates")
            self._json(200, result)
        except ValueError as error:
            self._json(400, {"error": str(error)})
        except Exception as error:
            self._json(502, {"error": f"Comparison failed: {error}"})
