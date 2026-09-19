#!/usr/bin/env python3
"""Classify shipping inbox emails and compare draft BLs with their SIs.

Run from this directory with ``python pipeline.py`` or provide a different
Inbox source and output path: ``python pipeline.py data submission.json``.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
import zipfile
from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree

from loader import Inbox


FIELDS = (
    "shipper", "consignee", "notify_party", "port_of_loading",
    "port_of_discharge", "container_count", "gross_weight_kg",
)

# The values are deliberately broad: the inbox includes forwarded messages,
# so classification is made from the subject and current-message text together.
SPAM_WORDS = ("winner", "prize", "lottery", "urgent payment", "mailbox full",
              "verify your account", "parcel fee", "bitcoin", "phishing",
              "exclusive offer", "hot singles", "update your account",
              "undelivered messages", "weird trick")
INVOICE_WORDS = ("invoice", "billing", "local charge", "thc", "freight charge",
                 "d & d", "detention", "demurrage", "missing gr", "credit note",
                 "total freight")
SI_REQUEST_WORDS = ("request si", "si needed", "cust si", "customer si",
                    "send the si", "shipping instruction needed")
COMPARISON_WORDS = ("confirm docs", "draft bl", "bill of lading", "shipping instruction",
                    "request bl draft", "check the details", "verify the bl", "bl matches", "amend bl")

LABELS = {
    "shipper": (r"shipper(?:\s*/\s*exporter)?", r"exporter", r"seller"),
    "consignee": (r"consignee", r"to\s+the\s+order\s+of", r"buyer"),
    "notify_party": (r"notify(?:\s+party)?",),
    "port_of_loading": (r"port\s+of\s+loading", r"load(?:ing)?\s+port", r"pol"),
    "port_of_discharge": (r"port\s+of\s+discharge", r"discharge\s+port", r"pod"),
    "container_count": (r"container\s+count", r"no\.?(?:\s+of)?\s+containers?(?:\s+or\s+packages)?",
                        r"total\s+containers?", r"containers?"),
    "gross_weight_kg": (r"gross\s*(?:weight|wt)(?:\s*\(?kgs?\)?)?",),
}


def classify(email: dict) -> str:
    subject = email.get("subject", "").casefold()
    text = f"{subject}\n{email.get('body', '')}".casefold()
    if any(word in text for word in SPAM_WORDS):
        return "SPAM"
    # SI emails often attach an instruction that lists required invoices, so
    # identify the explicit SI-request subject before invoice terminology.
    if (any(word in subject for word in SI_REQUEST_WORDS)
            or re.search(r"(?:^|[_\s])si\s*[-_]", subject)):
        return "SI_REQUEST"
    attachments = " ".join(email.get("attachments", ())).casefold()
    if (any(word in subject for word in COMPARISON_WORDS)
            # Coded subject convention: origin office - POD - carrier(BL) - OC...
            or re.search(r"\b(?:aie|afrt|afemy|afptme)\s*-\s*[^-]+\s*-\s*\w+\(", subject)
            or ("_si" in attachments and "_bl" in attachments)):
        return "BL_COMPARISON"
    # 'billing process completed' is a routine RPA notification, not a query.
    invoice_subject = subject.replace("billing process", "")
    if any(word in invoice_subject for word in INVOICE_WORDS):
        return "INVOICE_QUERY"
    return "GENERAL"


def extract_docx(data: bytes) -> str:
    with zipfile.ZipFile(BytesIO(data)) as archive:
        xml = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    return "\n".join("".join(node.itertext()) for node in root.iter()
                     if node.tag.endswith("}p"))


def extract_xlsx(data: bytes) -> str:
    with zipfile.ZipFile(BytesIO(data)) as archive:
        shared = []
        try:
            root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(item.itertext()) for item in root if item.tag.endswith("}si")]
        except KeyError:
            pass
        rows = []
        for name in archive.namelist():
            if not re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name):
                continue
            sheet = ElementTree.fromstring(archive.read(name))
            for row in sheet.iter():
                if not row.tag.endswith("}row"):
                    continue
                values = []
                for cell in row:
                    if not cell.tag.endswith("}c"):
                        continue
                    value = next((n.text for n in cell if n.tag.endswith("}v")), "") or ""
                    if cell.attrib.get("t") == "s" and value.isdigit():
                        value = shared[int(value)]
                    elif cell.attrib.get("t") == "inlineStr":
                        value = "".join(n.text or "" for n in cell.iter() if n.tag.endswith("}t"))
                    values.append(value)
                if values:
                    rows.append(" ".join(values))
    return "\n".join(rows)


def attachment_text(inbox: Inbox, path: str) -> str | None:
    """Return readable document text, or None when it cannot be extracted."""
    suffix = Path(path).suffix.casefold()
    try:
        if suffix == ".txt":
            text = inbox.read_text(path)
        else:
            data = inbox.read_bytes(path)
            if not data:
                return None
            if suffix == ".docx":
                text = extract_docx(data)
            elif suffix == ".xlsx":
                text = extract_xlsx(data)
            elif suffix == ".pdf":
                try:
                    from pypdf import PdfReader  # optional dependency
                    text = "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(data)).pages)
                except Exception:
                    return None
            else:
                return None
    except Exception:
        return None
    return text if text and text.strip() else None


def is_missing(value: str | None) -> bool:
    if value is None:
        return True
    return not value.strip() or bool(re.search(r"\b(?:tba|tbc|n/?a)\b|\?{2,}|_{3,}", value, re.I))


def extract_fields(text: str) -> dict[str, str | None]:
    values: dict[str, str | None] = {}
    for field, labels in LABELS.items():
        value = None
        for label in labels:
            # Restrict the match to its line so that each label remains paired
            # with its value in text, spreadsheet, and Word renderings.
            match = re.search(
                rf"(?im)^\s*(?:{label})(?:\s*\([^)]*\))?\s*(?::|\-|\u2013)\s*([^\r\n]+)",
                text,
            )
            if match:
                value = match.group(1).strip()
                break
        values[field] = value
    return values


def normalise_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).casefold()
    return re.sub(r"[^\w]+", "", value)


def normalise_number(value: str) -> str | None:
    match = re.search(r"\d[\d, .]*", value)
    if not match:
        return None
    raw = match.group(0).replace(" ", "").replace(",", "")
    try:
        number = Decimal(raw)
    except InvalidOperation:
        return None
    if number == number.to_integral():
        return str(int(number))
    return format(number.normalize(), "f").rstrip("0").rstrip(".")


def same_value(field: str, si_value: str, bl_value: str) -> bool:
    if field == "gross_weight_kg":
        return normalise_number(si_value) == normalise_number(bl_value)
    if field == "container_count":
        # The requested field is the count, not the container-size notation.
        return normalise_number(si_value) == normalise_number(bl_value)
    return normalise_text(si_value) == normalise_text(bl_value)


def compare(email: dict, inbox: Inbox) -> dict:
    attachments = email.get("attachments", [])
    si_paths = [p for p in attachments if re.search(r"(?:^|[_-])si(?:[_.-]|$)", Path(p).stem, re.I)]
    bl_paths = [p for p in attachments if re.search(r"(?:^|[_-])bl(?:[_.-]|$)", Path(p).stem, re.I)]
    message = f"{email.get('subject', '')}\n{email.get('body', '')}".casefold()

    # Requests for a draft that has not yet been attached are not comparisons.
    if not si_paths and not bl_paths:
        if "attach" in message or "enclosed" in message:
            return review("missing_attachment")
        return ok()
    if not si_paths or not bl_paths:
        return review("missing_attachment")

    si_text, bl_text = attachment_text(inbox, si_paths[0]), attachment_text(inbox, bl_paths[0])
    if si_text is None or bl_text is None:
        return review("unreadable")
    if "shipping instruction" not in si_text.casefold() or "bill of lading" not in bl_text.casefold():
        return review("wrong_doc_type")

    si, bl = extract_fields(si_text), extract_fields(bl_text)
    if any(is_missing(si[field]) or is_missing(bl[field]) for field in FIELDS):
        return review("missing_value")
    defects = [field for field in FIELDS if not same_value(field, si[field], bl[field])]
    if defects:
        return {"status": "MISMATCH", "review_reason": None,
                "defect_fields": defects, "has_defect": True}
    return ok()


def ok() -> dict:
    return {"status": "OK", "review_reason": None, "defect_fields": [], "has_defect": False}


def review(reason: str) -> dict:
    return {"status": "NEEDS_REVIEW", "review_reason": reason,
            "defect_fields": [], "has_defect": False}


def run(source: str = "data") -> dict:
    # The challenge bundle itself is a valid Inbox root.  Prefer the requested
    # data/ convention when present, while keeping the script directly runnable.
    if source == "data" and not Path(source).exists():
        source = str(Path(__file__).resolve().parent)
    inbox = Inbox(source)
    submission = {}
    for email in inbox:
        category = classify(email)
        result = compare(email, inbox) if category == "BL_COMPARISON" else ok()
        submission[email["email_id"]] = {"category": category, **result}
    return submission


def main() -> None:
    source = sys.argv[1] if len(sys.argv) > 1 else "data"
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("submission.json")
    output.write_text(json.dumps(run(source), indent=2) + "\n", encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
