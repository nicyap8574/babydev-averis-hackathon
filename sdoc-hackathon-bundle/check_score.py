#!/usr/bin/env python3
"""Score the deterministic pipeline against the organizers' ground truth.

    cd sdoc-hackathon-bundle && python check_score.py

Exits non-zero if the score regresses below EXPECTED. Classification uses
classify_keywords() directly rather than the LLM cascade, so the result is
deterministic and needs no API keys - this checks the floor the solution
guarantees when every provider is unavailable.

ground_truth.json is NOT part of the participant bundle. If it is absent this
script skips with exit code 0 rather than failing, so it stays runnable from a
plain bundle checkout.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from loader import Inbox
from pipeline import classify_keywords, compare, ok

BUNDLE = Path(__file__).resolve().parent
DOCKER = BUNDLE.parent / "sdoc-hackathon-docker"
GROUND_TRUTH = DOCKER / "data_v2" / "ground_truth.json"
SCORING_DIR = DOCKER / "server"

EXPECTED = {
    "final_score": 1.0,
    "stage1_macro_f1": 1.0,
    "stage3_defect_f1": 1.0,
    "end_to_end_rate": 1.0,
    "escalation_precision": 1.0,
    "escalation_recall": 1.0,
}


def build_submission() -> dict[str, dict]:
    inbox = Inbox(str(BUNDLE))
    submission = {}
    for email in inbox:
        category = classify_keywords(email)
        result = compare(email, inbox) if category == "BL_COMPARISON" else ok()
        submission[email["email_id"]] = {"category": category, **result}
    return submission


def main() -> int:
    if not GROUND_TRUTH.exists():
        print(f"SKIP: {GROUND_TRUTH} not found (participants do not have it).")
        return 0

    sys.path.insert(0, str(SCORING_DIR))
    from scoring import score_all  # organizers' single source of truth

    submission = build_submission()
    ground_truth = json.loads(GROUND_TRUTH.read_text(encoding="utf-8"))
    report = score_all(ground_truth, submission)

    actual = {
        "final_score": report["final_score"],
        "stage1_macro_f1": report["stage1"]["macro_f1"],
        "stage3_defect_f1": report["stage3"]["defect_f1"],
        "end_to_end_rate": report["end_to_end"]["rate"],
        "escalation_precision": report["reliability"]["escalation_precision"],
        "escalation_recall": report["reliability"]["escalation_recall"],
    }

    failures = []
    for name, want in EXPECTED.items():
        got = actual[name]
        flag = "ok" if got >= want - 1e-9 else "FAIL"
        if flag == "FAIL":
            failures.append(f"{name}: expected >= {want}, got {got:.4f}")
        print(f"  {flag:4}  {name:22} {got:.4f}")

    e2e = report["end_to_end"]
    print(f"\n  {e2e['success']}/{e2e['total']} defect emails routed and flagged correctly"
          f"  ({report['n_emails']} emails scored)")
    for reason, stats in sorted(report["reliability"]["per_reason"].items()):
        print(f"  escalation {reason:20} {stats['caught']}/{stats['total']}")

    if failures:
        print("\nREGRESSION:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("\nAll expected scores met.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
