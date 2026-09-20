#!/usr/bin/env python3
"""Regression tests for pipeline.py.

Standard-library unittest only, no external dependencies:

    cd sdoc-hackathon-bundle && python -m unittest test_pipeline -v

These cover the three defects that took the submission from 0.8616 to 1.0000
against the organizers' ground truth, plus the comparison behaviours that are
*deliberately* left strict (see "Open decisions to track" in CLAUDE.md).
"""
from __future__ import annotations

import unittest
from pathlib import Path

from loader import Inbox
from pipeline import (
    FIELDS, attachment_text, classify_keywords, compare, extract_fields,
    is_missing, normalise_number, same_value,
)

BUNDLE = Path(__file__).resolve().parent
inbox = Inbox(str(BUNDLE))


def fields_for(name: str) -> dict[str, str | None]:
    text = attachment_text(inbox, f"attachments/{name}")
    assert text is not None, f"{name} should be readable"
    return extract_fields(text)


class TestClassification(unittest.TestCase):
    """A broadcast reminder is not a request for a new SI."""

    # Every email carrying "Please submit SI & AED for all pending shipments"
    # is GENERAL in ground truth - including the two whose *subject* reads
    # "_Reminder_Paper - Submit SI & AED". A body scan for that phrase used to
    # classify all seven as SI_REQUEST.
    SUBMIT_SI_AED_EMAILS = ("email_021", "email_089", "email_230", "email_234",
                            "email_266", "email_431", "email_460")

    def test_submit_si_aed_reminders_are_general(self):
        for email_id in self.SUBMIT_SI_AED_EMAILS:
            with self.subTest(email_id=email_id):
                email = inbox.get(email_id)
                self.assertIn("Please submit SI & AED", email["body"])
                self.assertEqual(classify_keywords(email), "GENERAL")

    def test_genuine_si_request_still_detected(self):
        self.assertEqual(classify_keywords(inbox.get("email_007")), "SI_REQUEST")

    def test_comparison_request_still_detected(self):
        self.assertEqual(classify_keywords(inbox.get("email_001")), "BL_COMPARISON")


class TestTableLayoutExtraction(unittest.TestCase):
    """.docx/.pdf attachments put the label above the value, not before it."""

    def test_docx_label_above_value(self):
        got = fields_for("email_097_BL.docx")
        self.assertIsNotNone(got["shipper"])
        self.assertIn("APRIL FINE PAPER TRADING", got["shipper"])
        # The shipper's value line contains "P.O. BOX: 293775" - an embedded
        # colon must not be mistaken for the start of the next label.
        self.assertIn("DUBAI", got["shipper"])
        self.assertIn("NAGAPPA EXPORTS", got["notify_party"])
        self.assertEqual(normalise_number(got["container_count"]), "11")
        self.assertEqual(normalise_number(got["gross_weight_kg"]), "215950")

    def test_pdf_port_value_does_not_bleed_into_next_block(self):
        got = fields_for("email_059_SI.pdf")
        # "Port of Discharge (POD)" is followed by the value, then by
        # "Ocean Vessel" + its own value. A port is a single-line field, so the
        # vessel name must not be swallowed into it.
        self.assertEqual(got["port_of_discharge"], "FREMANTLE, AUSTRALIA")
        self.assertEqual(got["port_of_loading"], "BUATAN, INDONESIA")
        self.assertNotIn("SOLID", got["port_of_discharge"])

    def test_total_qualifier_before_label(self):
        # "TOTAL Gross Weight (KG): 131,322 KG" does not start with the label.
        got = fields_for("email_059_BL.pdf")
        self.assertEqual(normalise_number(got["gross_weight_kg"]), "131322")

    def test_every_field_extracted_from_a_table_pair(self):
        for name in ("email_055_SI.xlsx", "email_055_BL.docx"):
            with self.subTest(attachment=name):
                got = fields_for(name)
                for field in FIELDS:
                    self.assertFalse(is_missing(got[field]),
                                     f"{field} missing from {name}")


class TestBlankLabelGuard(unittest.TestCase):
    """A label present but blank is missing - never borrow the line below it."""

    def test_blank_inline_label_escalates(self):
        # email_519_SI.txt has a bare "SHIPPER: " and "No. of Containers: ".
        got = fields_for("email_519_SI.txt")
        self.assertTrue(is_missing(got["shipper"]))
        self.assertTrue(is_missing(got["container_count"]))
        # The consignee sits on the line directly below the blank shipper; if
        # the block fallback ran it would be stolen as the shipper's value.
        self.assertNotIn("NOVAKOPA", got["shipper"] or "")

    def test_blank_label_guard_does_not_depend_on_trailing_whitespace(self):
        # email_519_SI.txt happens to render "SHIPPER: " with a trailing space.
        # A document writing "Shipper:" with nothing after the colon must be
        # guarded identically - otherwise the block fallback takes the next
        # line and reports a value the document never stated.
        for text in ("Shipper:\nACME CO", "Shipper: \nACME CO", "Shipper:\t\nACME CO"):
            with self.subTest(text=text):
                got = extract_fields(text)["shipper"]
                self.assertTrue(is_missing(got))
                self.assertNotIn("ACME", got or "")

    def test_blank_value_produces_missing_value_review(self):
        result = compare(inbox.get("email_519"), inbox)
        self.assertEqual(result["status"], "NEEDS_REVIEW")
        self.assertEqual(result["review_reason"], "missing_value")
        self.assertFalse(result["has_defect"])


class TestIsMissing(unittest.TestCase):
    def test_placeholders_are_missing(self):
        for value in ("", "   ", "TBA", "tbc", "N/A", "NA", "n/a", "???",
                      "___", "____MT", "-", "..."):
            with self.subTest(value=value):
                self.assertTrue(is_missing(value))

    def test_none_is_missing(self):
        self.assertTrue(is_missing(None))

    def test_real_values_containing_placeholder_words_are_present(self):
        # The bug this guards: "\bn/?a\b" matched the standalone "NA" inside a
        # real company name and silently escalated a field that was there.
        for value in ("AL GURG NA TRADING", "NAGOYA, JAPAN", "PANAMA CITY",
                      "CHINA NATIONAL CORP", "TBILISI, GEORGIA"):
            with self.subTest(value=value):
                self.assertFalse(is_missing(value))


class TestComparisonStaysStrict(unittest.TestCase):
    """Cases we deliberately DO NOT normalise.

    Each of these would be made to compare equal by a normalisation rule, and
    each is therefore a way to mask a genuine defect on unseen data. They are
    tracked as open decisions in CLAUDE.md rather than implemented. These tests
    pin the current strict behaviour so that relaxing it is a conscious edit and
    not a silent drift - if you intentionally add one of those rules, update the
    matching assertion here and the CLAUDE.md checklist together.
    """

    def test_unlocode_suffix_is_not_normalised(self):
        self.assertFalse(same_value("port_of_loading", "BUATAN, INDONESIA",
                                    "BUATAN, INDONESIA (IDBUA)"))

    def test_weight_units_are_not_converted(self):
        self.assertFalse(same_value("gross_weight_kg", "22000 KG", "22 MT"))

    def test_container_size_first_notation_is_not_reordered(self):
        self.assertFalse(same_value("container_count", "3 x 40'HC", "40'HC x 3"))

    def test_corporate_suffixes_are_not_normalised(self):
        self.assertFalse(same_value("consignee", "ACME CO. LTD", "ACME CO. LIMITED"))


class TestComparisonNormalisation(unittest.TestCase):
    """Normalisation that IS applied, and the defects it must never hide."""

    def test_punctuation_and_whitespace_ignored(self):
        self.assertTrue(same_value("consignee", "ACME CO., LTD.", "ACME CO LTD"))
        self.assertTrue(same_value("shipper", "ACME  CO\nLTD", "ACME CO LTD"))

    def test_thousands_separators_and_plural_units_ignored(self):
        self.assertTrue(same_value("gross_weight_kg", "22000 KG", "22,000.00 KGS"))

    def test_genuine_differences_still_mismatch(self):
        self.assertFalse(same_value("gross_weight_kg", "22000", "22001"))
        self.assertFalse(same_value("container_count", "3 x 40'HC", "4 x 40'HC"))
        self.assertFalse(same_value("consignee", "ACME CO LTD", "ACME TRADING LTD"))


class TestEscalationReasons(unittest.TestCase):
    """The four NEEDS_REVIEW reasons, one representative email each."""

    CASES = (
        ("email_508", "missing_attachment"),
        ("email_511", "unreadable"),
        ("email_516", "missing_value"),
    )

    def test_review_reasons(self):
        for email_id, reason in self.CASES:
            with self.subTest(email_id=email_id):
                result = compare(inbox.get(email_id), inbox)
                self.assertEqual(result["status"], "NEEDS_REVIEW")
                self.assertEqual(result["review_reason"], reason)

    def test_image_only_pdf_escalates_rather_than_guessing(self):
        # No OCR/vision pass exists, so a scanned document must escalate with a
        # reason instead of silently comparing empty text.
        self.assertIsNone(attachment_text(inbox, "attachments/email_513_SI.pdf"))


class TestDetectedDefects(unittest.TestCase):
    """Defects that were invisible before the table-layout extractor landed."""

    CASES = (
        ("email_302", {"container_count"}),
        ("email_434", {"port_of_discharge"}),
        ("email_107", {"consignee", "container_count"}),
        ("email_354", {"gross_weight_kg", "notify_party"}),
    )

    def test_defect_fields(self):
        for email_id, expected in self.CASES:
            with self.subTest(email_id=email_id):
                result = compare(inbox.get(email_id), inbox)
                self.assertEqual(result["status"], "MISMATCH")
                self.assertTrue(result["has_defect"])
                self.assertEqual(set(result["defect_fields"]), expected)

    def test_clean_pair_reports_ok(self):
        result = compare(inbox.get("email_055"), inbox)
        self.assertEqual(result["status"], "OK")
        self.assertFalse(result["has_defect"])
        self.assertEqual(result["defect_fields"], [])


if __name__ == "__main__":
    unittest.main()
