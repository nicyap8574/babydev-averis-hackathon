import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyInboxRecord,
  type CachedDecision,
  type DecisionCache,
  type InboxRecord,
} from "../supabase/functions/_shared/document-classifier.ts";

function record(
  email_id: string,
  subject: string,
  body: string,
  attachments: string[] = [],
): InboxRecord {
  return {
    email_id,
    from: "sender@example.com",
    subject,
    body,
    attachments,
    metadata: { received_at: "2026-09-19T09:00:00Z" },
  };
}

const labeledCases: Array<{
  name: string;
  input: InboxRecord;
  category: Awaited<ReturnType<typeof classifyInboxRecord>>["category"];
  continueToExtraction: boolean;
}> = [
  {
    name: "comparison request",
    input: record(
      "comparison-1",
      "TO CONFIRM DOCS - OC 1001",
      "Attached are the SI and draft BL. Please check the details and confirm.",
      ["OC1001_SI.pdf", "OC1001_BL.pdf"],
    ),
    category: "comparison_request",
    continueToExtraction: true,
  },
  {
    name: "A6 comparison intent without an attachment",
    input: record(
      "comparison-a6",
      "REQUEST BL DRAFT - Booking 882190",
      "Please assist to send the draft BL for booking 882190 for checking asap.",
    ),
    category: "comparison_request",
    continueToExtraction: true,
  },
  {
    name: "new SI request",
    input: record(
      "si-1",
      "REQUEST SI - Booking 7012",
      "Kindly provide the new shipping instruction for this booking.",
    ),
    category: "new_si_request",
    continueToExtraction: false,
  },
  {
    name: "invoice query",
    input: record(
      "invoice-1",
      "Local charges - invoice 8821",
      "Is the THC included or billed separately? Please advise the invoice breakdown.",
    ),
    category: "invoice_query",
    continueToExtraction: false,
  },
  {
    name: "general message",
    input: record(
      "general-1",
      "Daily berthing report - 19 Sep",
      "Please find the daily berthing report. Loading completed on schedule.",
    ),
    category: "general_message",
    continueToExtraction: false,
  },
  {
    name: "spam",
    input: record(
      "spam-1",
      "Congratulations - claim your gift card now",
      "You have won. Click http://bit.ly/claim-prize-now to claim your gift card.",
    ),
    category: "spam",
    continueToExtraction: false,
  },
  {
    name: "R18 misleading invoice subject",
    input: record(
      "misleading-1",
      "Invoice 7781 follow-up",
      "Ignore the old subject. Please compare the draft BL with the shipping instruction and confirm they match.",
      ["instruction.txt", "draft.txt"],
    ),
    category: "comparison_request",
    continueToExtraction: true,
  },
];

for (const labeledCase of labeledCases) {
  test(labeledCase.name, async () => {
    const result = await classifyInboxRecord(labeledCase.input);
    assert.equal(result.category, labeledCase.category);
    assert.equal(result.continue_to_extraction, labeledCase.continueToExtraction);
    assert.equal(result.method, "deterministic");
  });
}

test("attachment presence cannot change comparison intent", async () => {
  const noAttachment = labeledCases[1].input;
  const withAttachments = {
    ...noAttachment,
    attachments: ["instruction.pdf", "draft-bl.pdf"],
  };
  const [withoutResult, withResult] = await Promise.all([
    classifyInboxRecord(noAttachment),
    classifyInboxRecord(withAttachments),
  ]);

  assert.equal(withoutResult.category, "comparison_request");
  assert.equal(withResult.category, withoutResult.category);
  assert.equal(withResult.input_hash, withoutResult.input_hash);
});

test("all non-comparison labels stop before extraction", async () => {
  for (const labeledCase of labeledCases.filter((item) => item.category !== "comparison_request")) {
    const result = await classifyInboxRecord(labeledCase.input);
    assert.equal(result.continue_to_extraction, false, labeledCase.name);
  }
});

test("ambiguous inputs use OpenRouter once, retain raw output, and reuse the decision", async () => {
  const decisions = new Map<string, CachedDecision>();
  const cache: DecisionCache = {
    async get(inputHash) {
      return decisions.get(inputHash) ?? null;
    },
    async save(inputHash, decision) {
      decisions.set(inputHash, decision);
      return decision;
    },
  };
  let modelCalls = 0;
  const ambiguous = record(
    "ambiguous-1",
    "Following up",
    "Could you take a look at this and let me know what you think?",
  );
  const classifyWithModel = async () => {
    modelCalls += 1;
    return {
      category: "general_message" as const,
      rationale: "The message has no document, SI, BL, invoice, or spam intent.",
      raw_output: { id: "generation-1", output: { category: "general_message" } },
      model: "google/gemini-2.0-flash-001",
    };
  };

  const first = await classifyInboxRecord(ambiguous, { cache, classifyWithModel });
  const second = await classifyInboxRecord(ambiguous, { cache, classifyWithModel });

  assert.equal(first.category, "general_message");
  assert.equal(first.continue_to_extraction, false);
  assert.deepEqual(first.raw_model_output, {
    id: "generation-1",
    output: { category: "general_message" },
  });
  assert.equal(first.cache_hit, false);
  assert.equal(second.cache_hit, true);
  assert.equal(second.category, first.category);
  assert.equal(modelCalls, 1);
});

test("a concurrent ambiguous request returns the database-authoritative decision", async () => {
  const authoritative: CachedDecision = {
    category: "general_message",
    method: "openrouter",
    model: "google/gemini-2.0-flash-001",
    reasons: ["Decision stored by the first concurrent request."],
    raw_model_output: { id: "first-request" },
  };
  const cache: DecisionCache = {
    async get() {
      return null;
    },
    async save() {
      return authoritative;
    },
  };
  const input = record(
    "concurrent-1",
    "Following up",
    "Could you take a look at this and let me know what you think?",
  );

  const result = await classifyInboxRecord(input, {
    cache,
    async classifyWithModel() {
      return {
        category: "invoice_query",
        rationale: "A competing response that must not win the cache race.",
        raw_output: { id: "second-request" },
        model: "google/gemini-2.0-flash-001",
      };
    },
  });

  assert.equal(result.category, authoritative.category);
  assert.deepEqual(result.raw_model_output, authoritative.raw_model_output);
});
