"""Parity tests: frontend/api/compare.py must agree with pipeline.py.

compare.py is what the deployed app runs; sdoc-hackathon-bundle/pipeline.py is
the reference implementation that scores against ground truth. The two are
separate copies on purpose — the bundle has to run standalone for the
organizers, and Vercel only deploys frontend/ — so this suite is what keeps
them from drifting apart again.

pipeline.py is the oracle, not the recorded submission.json: that file is a
frozen artifact and was already stale by 18 emails when this suite was written.

Both are driven over the real bundle with compare.download() redirected at
local files, so no Supabase credentials or network access are needed.

Run from the repository root:
    python -m unittest tests.test_compare -v
"""
from __future__ import annotations

import json
import sys
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "sdoc-hackathon-bundle"
sys.path.insert(0, str(ROOT / "frontend" / "api"))
sys.path.insert(0, str(BUNDLE))

import compare as service  # noqa: E402
import pipeline  # noqa: E402
from loader import Inbox  # noqa: E402


def storage_attachments(paths: list[str]) -> list[dict]:
    """Shape bundle paths the way the browser writes them into inbox_records.

    The stored `path` is the Storage key, and compare() only reads dict items
    carrying a string `path` — a bare string array yields no paths at all.
    """
    return [{"name": Path(path).name, "path": path} for path in paths]


class CompareParityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.inbox = Inbox(str(BUNDLE))
        cls.emails = {
            path.stem: json.loads(path.read_text(encoding="utf-8"))
            for path in sorted((BUNDLE / "inbox").glob("email_*.json"))
        }
        # compare.py runs only for category == comparison_request; do_POST
        # short-circuits everything else as "not_applicable", and pipeline.py
        # likewise calls compare() only for BL_COMPARISON. Parity is only
        # meaningful over that subset.
        ground_truth = json.loads(
            (ROOT / "sdoc-hackathon-docker" / "data_v2" / "ground_truth.json").read_text(encoding="utf-8")
        )
        cls.comparison_ids = [
            email_id for email_id in cls.emails
            if ground_truth.get(email_id, {}).get("category") == "BL_COMPARISON"
        ]
        # Serve the bundle's own files in place of private Storage downloads.
        service.download = lambda path: (BUNDLE / path).read_bytes()

    def hosted(self, email_id: str) -> dict:
        email = self.emails[email_id]
        return service.compare(
            storage_attachments(email["attachments"]),
            email.get("subject", ""),
            email.get("body", ""),
        )

    def reference(self, email_id: str) -> dict:
        return pipeline.compare(self.emails[email_id], self.inbox)

    # -- whole-corpus parity ---------------------------------------------------

    def test_every_comparison_email_matches_pipeline(self):
        mismatched = []
        for email_id in self.comparison_ids:
            hosted, reference = self.hosted(email_id), self.reference(email_id)
            if (hosted["status"], hosted["review_reason"]) != (reference["status"], reference["review_reason"]):
                mismatched.append((
                    email_id,
                    f"pipeline={reference['status']}/{reference['review_reason']}",
                    f"compare={hosted['status']}/{hosted['review_reason']}",
                ))
        self.maxDiff = None
        self.assertEqual(mismatched, [], f"{len(mismatched)} emails disagree with pipeline.py")

    def test_defect_fields_match_pipeline(self):
        for email_id in self.comparison_ids:
            hosted, reference = self.hosted(email_id), self.reference(email_id)
            if reference["status"] == "MISMATCH":
                self.assertEqual(
                    sorted(hosted["defect_fields"]), sorted(reference["defect_fields"]), email_id
                )

    # -- the specific rules compare.py had been missing ------------------------

    def test_comparison_email_with_no_attachments_is_ok(self):
        """Every email in this corpus carries a boilerplate disclaimer
        mentioning "attachments", so an email that never claimed one must not
        escalate. Without the attach-intent guard 96 of 220 escalated here."""
        email_id = next(
            eid for eid in self.comparison_ids
            if not self.emails[eid]["attachments"] and self.reference(eid)["status"] == "OK"
        )
        self.assertEqual(self.hosted(email_id)["status"], "OK")

    def test_email_claiming_an_absent_attachment_escalates(self):
        email_id = next(
            eid for eid in self.comparison_ids
            if not self.emails[eid]["attachments"]
            and self.reference(eid)["review_reason"] == "missing_attachment"
        )
        self.assertEqual(self.hosted(email_id)["review_reason"], "missing_attachment")

    def test_missing_attachment_count_stays_small(self):
        reasons = Counter(
            self.hosted(email_id)["review_reason"] for email_id in self.comparison_ids
        )
        self.assertEqual(
            reasons["missing_attachment"],
            Counter(self.reference(eid)["review_reason"] for eid in self.comparison_ids)["missing_attachment"],
        )

    def test_each_escalation_reason_is_reproduced(self):
        for reason in ("wrong_doc_type", "unreadable", "missing_value"):
            expected = [eid for eid in self.comparison_ids if self.reference(eid)["review_reason"] == reason]
            self.assertTrue(expected, f"corpus has no {reason} case to check")
            for email_id in expected:
                self.assertEqual(self.hosted(email_id)["review_reason"], reason, email_id)

    def test_unreadable_pdf_escalates_rather_than_raising(self):
        """An image-only or truncated PDF must return None, not propagate a
        pypdf exception as a 502."""
        self.assertIsNone(service.attachment_text("attachments/email_513_SI.pdf"))

    # -- the attachment-shape trap --------------------------------------------

    def test_string_attachments_are_invisible_to_compare(self):
        """A bare string array — which the Edge Function accepts and upserts
        verbatim — reads as "no attachments at all", so a real MISMATCH
        silently reports OK. Batch ingest must write dict records carrying a
        storage `path`."""
        email = self.emails["email_004"]
        self.assertEqual(self.hosted("email_004")["status"], "MISMATCH")
        self.assertEqual(
            service.compare(email["attachments"], email["subject"], email["body"])["status"],
            "OK",
        )


if __name__ == "__main__":
    unittest.main()
