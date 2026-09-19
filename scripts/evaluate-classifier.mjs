import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deterministicClassify } from "../supabase/functions/_shared/document-classifier.ts";

const root = new URL("../", import.meta.url);
const groundTruth = JSON.parse(
  fs.readFileSync(new URL("sdoc-hackathon-docker/data_v2/ground_truth.json", root), "utf8"),
);
const categoryMap = {
  BL_COMPARISON: "comparison_request",
  SI_REQUEST: "new_si_request",
  INVOICE_QUERY: "invoice_query",
  GENERAL: "general_message",
  SPAM: "spam",
};

let decided = 0;
let correct = 0;
const misses = [];

for (const [emailId, expected] of Object.entries(groundTruth)) {
  const inboxPath = path.join(
    fileURLToPath(root),
    "sdoc-hackathon-docker",
    "data_v2",
    "inbox",
    `${emailId}.json`,
  );
  const email = JSON.parse(fs.readFileSync(inboxPath, "utf8"));
  const decision = deterministicClassify(email);
  if (!decision.category) continue;

  decided += 1;
  const wanted = categoryMap[expected.category];
  if (decision.category === wanted) {
    correct += 1;
  } else {
    misses.push({
      email_id: emailId,
      wanted,
      got: decision.category,
      subject: email.subject,
      scores: decision.scores,
    });
  }
}

console.log(JSON.stringify({
  total: Object.keys(groundTruth).length,
  decided,
  ambiguous: Object.keys(groundTruth).length - decided,
  correct,
  deterministic_precision: decided === 0 ? 0 : correct / decided,
  misses,
}, null, 2));
