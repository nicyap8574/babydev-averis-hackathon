#!/usr/bin/env python3
"""Classify shipping inbox emails and compare draft BLs with their SIs.

Run from this directory with ``python pipeline.py`` or provide a different
Inbox source and output path: ``python pipeline.py data submission.json``.
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
import unicodedata
import zipfile
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from loader import Inbox


FIELDS = (
    "shipper", "consignee", "notify_party", "port_of_loading",
    "port_of_discharge", "container_count", "gross_weight_kg",
)

FIELD_LABELS = {
    "shipper": "Shipper",
    "consignee": "Consignee",
    "notify_party": "Notify Party",
    "port_of_loading": "Port of Loading",
    "port_of_discharge": "Port of Discharge",
    "container_count": "Container Count",
    "gross_weight_kg": "Gross Weight",
}

# The values are deliberately broad: the inbox includes forwarded messages,
# so classification is made from the subject and current-message text together.
SPAM_WORDS = ("winner", "prize", "lottery", "urgent payment", "mailbox full",
              "verify your account", "parcel fee", "bitcoin", "phishing",
              "exclusive offer", "hot singles", "update your account",
              "undelivered messages", "weird trick", "bank officer",
              "business proposal", "limited time offer", "buy now",
              "you have won", "claim now", "storage is full")
INVOICE_WORDS = ("invoice", "billing", "local charge", "thc", "freight charge",
                 "d & d", "detention", "demurrage", "missing gr", "credit note",
                 "total freight")
SI_REQUEST_WORDS = ("request si", "si needed", "cust si", "customer si",
                    "send the si", "shipping instruction needed")
# NOTE: a body scan for "please/kindly submit ... SI" used to live here. It was
# removed: every email carrying that phrase in this dataset is a *broadcast
# reminder*, not a request for a new SI, and ground truth labels all of them
# GENERAL - even the ones whose subject reads "_Reminder_Paper - Submit SI &
# AED_13-01-2026". The rule cost 7 false SI_REQUESTs and 7 GENERAL misses.
# supabase/functions/_shared/document-classifier.ts already treats
# "submit si & aed" as a routine operational message; classification here is
# subject-and-attachment only, and scores 520/520 on its own.
COMPARISON_WORDS = ("confirm docs", "draft bl", "bill of lading", "shipping instruction",
                    "request bl draft", "check the details", "verify the bl", "bl matches", "amend bl")

LLM_MODEL = "nvidia/nemotron-3-ultra-550b-a55b"
LLM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
LLM_LABELS = {
    "document_comparison": "BL_COMPARISON",
    "new_si_request": "SI_REQUEST",
    "invoice_query": "INVOICE_QUERY",
    "general": "GENERAL",
    "spam": "SPAM",
}
CACHE_PATH = Path("llm_cache.json")
FALLBACK_LOG_PATH = Path("llm_fallbacks.log")

# Groq model opinions, NVIDIA, then Cerebras; deterministic rules are last.
# hard-fails, called directly against each provider's own API (not proxied
# directly against each provider API so each draws from its own quota. Preference order is
# evidence-based, from a live head-to-head test on this dataset's hardest
# emails (see PR/chat history, not reproduced here): both Groq models had
# zero failures and the best accuracy (94%); NVIDIA was accurate when it
# answered but failed ~31% of the time (mostly rate limits); Gemini
# 3.6/3.5-Flash-Lite were removed after testing showed 3.6 Flash rate-limits
# almost immediately even at conservative pacing, and 3.5 Flash-Lite has the
# worst accuracy of any tested provider (69%) while never hard-failing - the
# worst combination, since it silently wins the cascade with wrong answers
# instead of letting a more reliable tier take over. Cascade order:
# Groq GPT-OSS 120B -> Groq Llama 3.3 70B -> Groq Qwen3.8-27B -> NVIDIA ->
# Cerebras Qwen3-32B -> keyword rules.
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL_PRIMARY = "openai/gpt-oss-120b"  # preferred Groq fallback
GROQ_MODEL_SECONDARY = "llama-3.3-70b-versatile"  # tried if GPT-OSS 120B fails
GROQ_MODEL_TERTIARY = "qwen/qwen3.8-27b"  # tried if both above fail
GROQ_MAX_CALLS_PER_RUN = int(os.environ.get("GROQ_MAX_CALLS_PER_RUN", "200"))

# Cerebras, called directly against its own API (OpenAI-compatible chat
# completions, same shape as Groq). qwen-3-32b was chosen for its free-tier
# rate limit (Cerebras scales free-tier quota down with model size, and this
# sits in a more generous bracket than 70B+ models) and for model-family
# diversity from everything else in this cascade. Pacing/cap below are
# conservative defaults - verify current free-tier RPM/RPD on
# cloud.cerebras.ai and tune if this proves too slow or too easily exhausted.
CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions"
CEREBRAS_MODEL = "qwen-3-32b"
CEREBRAS_MAX_CALLS_PER_RUN = int(os.environ.get("CEREBRAS_MAX_CALLS_PER_RUN", "200"))


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


def classify_keywords(email: dict) -> str:
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


class LLMClassifier:
    """Provider cascade with a result cache and deterministic keyword fallback."""

    def __init__(self, cache_path: Path = CACHE_PATH, fallback_log_path: Path = FALLBACK_LOG_PATH):
        self.cache_path = cache_path
        self.fallback_log_path = fallback_log_path
        self.api_key = os.environ.get("NVIDIA_API_KEY", "")
        self.groq_api_key = os.environ.get("GROQ_API_KEY", "")
        self.cerebras_api_key = os.environ.get("CEREBRAS_API_KEY", "")
        self.lock = threading.Lock()
        self.fallbacks: list[tuple[str, str]] = []
        self._groq_calls: dict[str, int] = {}
        self._groq_exhausted: dict[str, threading.Event] = {}
        self._groq_last_call: dict[str, float] = {}
        self._cerebras_calls = 0
        self._cerebras_exhausted = threading.Event()
        self._cerebras_last_call = 0.0
        self.cache = self._load_cache(cache_path)

    @staticmethod
    def _load_cache(cache_path: Path) -> dict[str, dict[str, str]]:
        try:
            raw = json.loads(cache_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, AttributeError):
            return {}
        cache: dict[str, dict[str, str]] = {}
        for email_id, value in raw.items():
            if isinstance(value, str) and value in LLM_LABELS:
                # Legacy cache format (label only): those entries were all
                # produced by NVIDIA.
                cache[email_id] = {"label": value, "provider": "nvidia"}
            elif (isinstance(value, dict) and value.get("label") in LLM_LABELS
                    and value.get("provider") in (
                        "nvidia", "groq_gpt_oss_120b", "groq_llama_70b", "groq_qwen_27b",
                        "cerebras_qwen_32b")):
                cache[email_id] = value
        return cache

    def _log_fallback(self, email_id: str, reason: str) -> None:
        with self.lock:
            self.fallbacks.append((email_id, reason))
            with self.fallback_log_path.open("a", encoding="utf-8") as log:
                log.write(f"{email_id}\t{reason}\n")

    def _request_label_nvidia(self, email: dict) -> tuple[str | None, str | None]:
        if not self.api_key:
            return None, "missing_api_key"
        prompt = (
            "Classify this shipping email into exactly one label: "
            '"document_comparison", "new_si_request", "invoice_query", "general", or "spam".\n'
            "Return only a JSON string value containing the label, with no other text.\n\n"
            f"Subject: {email.get('subject', '')}\n\nBody:\n{email.get('body', '')}"
        )
        payload = {
            "model": LLM_MODEL,
            "temperature": 0,
            "chat_template_kwargs": {"enable_thinking": False},
            "messages": [{"role": "user", "content": prompt}],
        }
        body = json.dumps(payload).encode("utf-8")
        reason = "unknown_error"
        for attempt in range(4):
            try:
                request = Request(
                    LLM_URL,
                    data=body,
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    method="POST",
                )
                with urlopen(request, timeout=30) as response:
                    result = json.loads(response.read().decode("utf-8"))
                content = result["choices"][0]["message"]["content"]
                label = json.loads(content.strip())
                if isinstance(label, str) and label in LLM_LABELS:
                    return label, None
                reason = "bad_label"
            except HTTPError as error:
                reason = f"http_{error.code}"
            except TimeoutError:
                reason = "timeout"
            except URLError as error:
                reason = "timeout" if "timed out" in str(error.reason).lower() else "network_error"
            except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError):
                reason = "bad_response"
            except Exception as error:
                # A free-tier provider can return an unexpected response shape;
                # this must never abort the batch instead of using the fallback.
                reason = f"api_error_{type(error).__name__.lower()}"
            if attempt < 3:
                time.sleep(2 ** (attempt + 1))
        return None, reason

    def _request_label_groq(
        self, email: dict, model: str, reasoning_effort: str | None = None
    ) -> tuple[str | None, str | None]:
        """LLM opinion against Groq's own API, tried before NVIDIA and Cerebras.
        Each Groq model has
        its own separate free-tier rate-limit bucket (30 RPM/1,000 RPD/8,000
        TPM), so calls/exhaustion/pacing are tracked per model id."""
        if not self.groq_api_key:
            return None, "missing_api_key"
        exhausted = self._groq_exhausted.setdefault(model, threading.Event())
        if exhausted.is_set():
            return None, "budget_exhausted"
        with self.lock:
            calls = self._groq_calls.get(model, 0)
            if calls >= GROQ_MAX_CALLS_PER_RUN:
                exhausted.set()
                return None, "budget_exhausted"
            self._groq_calls[model] = calls + 1
            last_call = self._groq_last_call.get(model, 0.0)
            wait = 2.1 - (time.monotonic() - last_call)
            self._groq_last_call[model] = time.monotonic() + max(wait, 0)
        if wait > 0:
            time.sleep(wait)

        labels = ", ".join(f'"{label}"' for label in LLM_LABELS)
        prompt = (
            f"Classify this shipping email into exactly one label: {labels}.\n"
            "Return only a JSON string value containing the label, with no other text.\n\n"
            f"Subject: {email.get('subject', '')}\n\nBody:\n{email.get('body', '')}"
        )
        payload = {
            "model": model,
            "temperature": 0,
            "messages": [{"role": "user", "content": prompt}],
        }
        if reasoning_effort:
            payload["reasoning_effort"] = reasoning_effort
        body = json.dumps(payload).encode("utf-8")
        reason = "unknown_error"
        for attempt in range(2):
            try:
                request = Request(
                    GROQ_URL,
                    data=body,
                    headers={
                        "Authorization": f"Bearer {self.groq_api_key}",
                        "Content-Type": "application/json",
                        # Groq's Cloudflare front end returns 403 (error 1010)
                        # for requests with no/default User-Agent, which is
                        # what urllib sends unless overridden here.
                        "User-Agent": "sdoc-hackathon-pipeline/1.0",
                    },
                    method="POST",
                )
                with urlopen(request, timeout=30) as response:
                    result = json.loads(response.read().decode("utf-8"))
                content = result["choices"][0]["message"]["content"]
                label = json.loads(content.strip())
                if isinstance(label, dict) and isinstance(label.get("label"), str):
                    # GPT-OSS 120B sometimes wraps the answer as
                    # {"label": "..."} instead of a bare JSON string despite
                    # the prompt asking for the latter - accept both shapes.
                    label = label["label"]
                if isinstance(label, str) and label in LLM_LABELS:
                    return label, None
                reason = "bad_label"
            except HTTPError as error:
                reason = f"http_{error.code}"
                if error.code == 429:
                    # A real rate-limit hit - stop sending any further
                    # requests to this specific Groq model for the rest of
                    # this run (the other Groq model keeps its own budget).
                    exhausted.set()
                    return None, reason
            except TimeoutError:
                reason = "timeout"
            except URLError as error:
                reason = "timeout" if "timed out" in str(error.reason).lower() else "network_error"
            except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError):
                reason = "bad_response"
            except Exception as error:
                reason = f"api_error_{type(error).__name__.lower()}"
            if attempt < 1:
                time.sleep(3 * (attempt + 1))
        return None, reason

    def _request_label_cerebras(self, email: dict) -> tuple[str | None, str | None]:
        """LLM opinion against Cerebras's own API (OpenAI-compatible chat
        completions, same shape as Groq), tried only after NVIDIA and all
        three Groq models have failed. See the module-level comment on
        CEREBRAS_MODEL for why this model/pacing was chosen and the caveat
        that the pacing is a conservative default, not a confirmed limit."""
        if not self.cerebras_api_key:
            return None, "missing_api_key"
        if self._cerebras_exhausted.is_set():
            return None, "budget_exhausted"
        with self.lock:
            if self._cerebras_calls >= CEREBRAS_MAX_CALLS_PER_RUN:
                self._cerebras_exhausted.set()
                return None, "budget_exhausted"
            self._cerebras_calls += 1
            wait = 3.0 - (time.monotonic() - self._cerebras_last_call)
            self._cerebras_last_call = time.monotonic() + max(wait, 0)
        if wait > 0:
            time.sleep(wait)

        labels = ", ".join(f'"{label}"' for label in LLM_LABELS)
        prompt = (
            f"Classify this shipping email into exactly one label: {labels}.\n"
            "Return only a JSON string value containing the label, with no other text.\n\n"
            f"Subject: {email.get('subject', '')}\n\nBody:\n{email.get('body', '')}"
        )
        payload = {
            "model": CEREBRAS_MODEL,
            "temperature": 0,
            "messages": [{"role": "user", "content": prompt}],
        }
        body = json.dumps(payload).encode("utf-8")
        reason = "unknown_error"
        for attempt in range(2):
            try:
                request = Request(
                    CEREBRAS_URL,
                    data=body,
                    headers={
                        "Authorization": f"Bearer {self.cerebras_api_key}",
                        "Content-Type": "application/json",
                        "User-Agent": "sdoc-hackathon-pipeline/1.0",
                    },
                    method="POST",
                )
                with urlopen(request, timeout=30) as response:
                    result = json.loads(response.read().decode("utf-8"))
                content = result["choices"][0]["message"]["content"]
                label = json.loads(content.strip())
                if isinstance(label, dict) and isinstance(label.get("label"), str):
                    label = label["label"]
                if isinstance(label, str) and label in LLM_LABELS:
                    return label, None
                reason = "bad_label"
            except HTTPError as error:
                reason = f"http_{error.code}"
                if error.code == 429:
                    # A real rate-limit hit - stop sending any further
                    # Cerebras requests for the rest of this run.
                    self._cerebras_exhausted.set()
                    return None, reason
            except TimeoutError:
                reason = "timeout"
            except URLError as error:
                reason = "timeout" if "timed out" in str(error.reason).lower() else "network_error"
            except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError):
                reason = "bad_response"
            except Exception as error:
                reason = f"api_error_{type(error).__name__.lower()}"
            if attempt < 1:
                time.sleep(3 * (attempt + 1))
        return None, reason

    def classify(self, email: dict) -> str:
        email_id = email["email_id"]
        with self.lock:
            cached = self.cache.get(email_id)
        if cached:
            return LLM_LABELS[cached["label"]]

        label, groq_120b_reason = self._request_label_groq(
            email, GROQ_MODEL_PRIMARY, reasoning_effort="low"
        )
        if label:
            self._store_cache(email_id, label, "groq_gpt_oss_120b")
            return LLM_LABELS[label]

        label, groq_70b_reason = self._request_label_groq(email, GROQ_MODEL_SECONDARY)
        if label:
            self._store_cache(email_id, label, "groq_llama_70b")
            return LLM_LABELS[label]

        label, groq_27b_reason = self._request_label_groq(email, GROQ_MODEL_TERTIARY)
        if label:
            self._store_cache(email_id, label, "groq_qwen_27b")
            return LLM_LABELS[label]

        label, nvidia_reason = self._request_label_nvidia(email)
        if label:
            self._store_cache(email_id, label, "nvidia")
            return LLM_LABELS[label]

        label, cerebras_reason = self._request_label_cerebras(email)
        if label:
            self._store_cache(email_id, label, "cerebras_qwen_32b")
            return LLM_LABELS[label]

        self._log_fallback(
            email_id,
            f"groq_gpt_oss_120b:{groq_120b_reason};groq_llama_70b:{groq_70b_reason};"
            f"groq_qwen_27b:{groq_27b_reason};nvidia:{nvidia_reason};"
            f"cerebras_qwen_32b:{cerebras_reason}",
        )
        return classify_keywords(email)

    def _store_cache(self, email_id: str, label: str, provider: str) -> None:
        with self.lock:
            self.cache[email_id] = {"label": label, "provider": provider}

    def save_cache(self) -> None:
        with self.lock:
            self.cache_path.write_text(json.dumps(self.cache, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def classify(email: dict) -> str:
    """Retain the original public function as the deterministic fallback."""
    return classify_keywords(email)


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
                if len(values) == 2:
                    # Some templates render a label/value pair as two bare
                    # cells with no colon in either cell; restore the
                    # separator so extract_fields() can still pair them.
                    rows.append(f"{values[0]}: {values[1]}")
                elif values:
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


# A run of blanking characters marks the value missing wherever it occurs, since
# templates pad placeholders with units ("____MT" in email_517/email_518).
BLANK_RUN_RE = re.compile(r"\?{2,}|_{3,}")
# An alphabetic placeholder only counts when it is the WHOLE value. Matching it
# mid-string reports a real name as missing - "AL GURG NA TRADING" contains a
# standalone "NA" - which silently escalates a field that was there all along.
PLACEHOLDER_RE = re.compile(r"^(?:tba|tbc|t\.b\.a\.?|n/?a|nil|none|-+|\.+)$", re.I)


def is_missing(value: str | None) -> bool:
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
        # A value that cannot be traced to its own label is dropped, never
        # guessed; see CLAUDE.md's "the model never decides".
        if field in inline_labels or not is_missing(values[field]):
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
    # Every inbox email carries a boilerplate security disclaimer mentioning
    # "attachments", so a bare "attach" substring check false-positives on
    # every attachment-less email; require an actual attach-intent phrase.
    if not si_paths and not bl_paths:
        if (re.search(
                r"pleas\w*\s+(?:find|see)\s+(?:the\s+)?attach"
                r"|draft\s+bl\s+attached|is\s+attached"
                r"|attach\w*\s+(?:appear|seem)\w*\s+(?:to\s+have\s+been\s+)?(?:dropped|missing|lost)"
                r"|fail\w*\s+to\s+attach|didn'?t\s+attach|couldn'?t\s+attach|not\s+attached",
                message)
                or "enclosed" in message):
            return review("missing_attachment")
        return ok()
    if not si_paths or not bl_paths:
        return review("missing_attachment")

    si_text, bl_text = attachment_text(inbox, si_paths[0]), attachment_text(inbox, bl_paths[0])
    if si_text is None or bl_text is None:
        return review("unreadable")
    si_low = si_text.casefold()
    # This dataset also titles SI documents "BL Instruction" or "Bill of
    # Lading Instruction" (industry synonyms for the shipping-instruction doc).
    si_ok = ("shipping instruction" in si_low or "bl instruction" in si_low
             or "bill of lading instruction" in si_low)
    if not si_ok or "bill of lading" not in bl_text.casefold():
        return review("wrong_doc_type")

    si, bl = extract_fields(si_text), extract_fields(bl_text)
    if any(is_missing(si[field]) or is_missing(bl[field]) for field in FIELDS):
        return review("missing_value")
    defects = [field for field in FIELDS if not same_value(field, si[field], bl[field])]
    if defects:
        return {"status": "MISMATCH", "review_reason": None,
                "defect_fields": defects, "has_defect": True}
    return ok()


def field_comparison_rows(email: dict, inbox: Inbox, result: dict) -> list[dict]:
    """Per-field SI/BL values + match/mismatch status for the review UI's case
    detail view. Ported from backend.py's former on-demand /emails/{id} logic
    (same _si/_bl substring matching, same placeholder-row fallback) so it can
    instead be precomputed once here and stored alongside the classification,
    rather than recomputed from attachment files on every UI request."""
    fields: list[dict] = []
    defect_fields = set(result.get("defect_fields", []))

    if result.get("category") == "BL_COMPARISON":
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

    return fields


def ok() -> dict:
    return {"status": "OK", "review_reason": None, "defect_fields": [], "has_defect": False}


def review(reason: str) -> dict:
    return {"status": "NEEDS_REVIEW", "review_reason": reason,
            "defect_fields": [], "has_defect": False}


def _resolve_source(source: str) -> str:
    # The challenge bundle itself is a valid Inbox root.  Prefer the requested
    # data/ convention when present, while keeping the script directly runnable.
    if source == "data" and not Path(source).exists():
        return str(Path(__file__).resolve().parent)
    return source


def run(source: str = "data") -> dict:
    inbox = Inbox(_resolve_source(source))
    emails = list(inbox)
    classifier = LLMClassifier()
    # The executor enforces the free-tier request limit while cache hits return
    # immediately without an API call.
    with ThreadPoolExecutor(max_workers=2) as pool:
        categories = list(pool.map(classifier.classify, emails))
    classifier.save_cache()
    submission = {}
    for email, category in zip(emails, categories):
        result = compare(email, inbox) if category == "BL_COMPARISON" else ok()
        submission[email["email_id"]] = {"category": category, **result}
    return submission


def _build_case_rows(emails: list[dict], inbox: Inbox, submission: dict) -> dict[str, dict]:
    """One row per email_id for Supabase sync, with precomputed field comparisons."""
    rows = {}
    for email in emails:
        result = submission.get(email["email_id"])
        if result is None:
            continue
        rows[email["email_id"]] = {
            **result,
            "field_comparison": field_comparison_rows(email, inbox, result),
        }
    return rows


def main() -> None:
    source = sys.argv[1] if len(sys.argv) > 1 else "data"
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("submission.json")
    submission = run(source)
    output.write_text(json.dumps(submission, indent=2) + "\n", encoding="utf-8")
    print(output)

    # Everything below is best-effort additional persistence. submission.json
    # above is the scored contract and must never depend on any of it.
    inbox = Inbox(_resolve_source(source))
    emails = list(inbox)
    rows = _build_case_rows(emails, inbox, submission)

    try:
        from supabase_sync import sync_submission
        sync_submission(emails, rows)
    except Exception as error:
        print(f"[supabase_sync] skipped: {error}", file=sys.stderr)


if __name__ == "__main__":
    main()
