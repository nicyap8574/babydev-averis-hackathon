export const DOCUMENT_CATEGORIES = [
  "comparison_request",
  "new_si_request",
  "invoice_query",
  "general_message",
  "spam",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export type Attachment =
  | string
  | {
    name: string;
    content_type?: string;
    size_bytes?: number;
  };

export interface InboxRecord {
  email_id: string;
  from?: string;
  subject: string;
  body: string;
  attachments: Attachment[];
  metadata?: Record<string, unknown>;
}

export interface ClassificationResult {
  category: DocumentCategory;
  continue_to_extraction: boolean;
  method: "deterministic" | "openrouter";
  classifier_version: string;
  model: string | null;
  input_hash: string;
  cache_hit: boolean;
  reasons: string[];
  raw_model_output: unknown | null;
}

export interface ModelDecision {
  category: DocumentCategory;
  rationale: string;
  raw_output: unknown;
  model: string;
}

export interface CachedDecision {
  category: DocumentCategory;
  method: "openrouter";
  model: string;
  reasons: string[];
  raw_model_output: unknown;
}

export interface DecisionCache {
  get(inputHash: string): Promise<CachedDecision | null>;
  save(inputHash: string, decision: CachedDecision): Promise<CachedDecision>;
}

export interface ClassifierOptions {
  classifyWithModel?: (input: {
    subject: string;
    body: string;
    sender: string;
  }) => Promise<ModelDecision>;
  cache?: DecisionCache;
}

interface Rule {
  category: DocumentCategory;
  source: "subject" | "body";
  pattern: RegExp;
  weight: number;
  reason: string;
}

interface DeterministicDecision {
  category: DocumentCategory | null;
  scores: Record<DocumentCategory, number>;
  reasons: string[];
}

export const CLASSIFIER_VERSION = "identify-document-request-v1";

const RULES: Rule[] = [
  {
    category: "comparison_request",
    source: "body",
    pattern: /\b(?:compare|check|verify|review|confirm)\b[\s\S]{0,100}\b(?:draft\s*)?(?:b\/?l|bill of lading)\b[\s\S]{0,120}\b(?:si|shipping instruction)\b|\b(?:si|shipping instruction)\b[\s\S]{0,120}\b(?:compare|check|verify|review|confirm|match(?:es)?)\b[\s\S]{0,100}\b(?:draft\s*)?(?:b\/?l|bill of lading)\b/i,
    weight: 9,
    reason: "body explicitly asks to compare the SI and BL",
  },
  {
    category: "comparison_request",
    source: "body",
    pattern: /\b(?:attached|enclosed)\b[\s\S]{0,100}\b(?:si|shipping instruction)\b[\s\S]{0,100}\b(?:draft\s*)?(?:b\/?l|bill of lading)\b|\b(?:attached|enclosed)\b[\s\S]{0,100}\b(?:draft\s*)?(?:b\/?l|bill of lading)\b[\s\S]{0,100}\b(?:si|shipping instruction)\b/i,
    weight: 8,
    reason: "body describes an SI and BL pair",
  },
  {
    category: "comparison_request",
    source: "body",
    pattern: /\b(?:send|provide|share)\b[\s\S]{0,50}\bdraft\s*(?:b\/?l|bill of lading)\b[\s\S]{0,80}\b(?:check|checking|review|confirm)/i,
    weight: 8,
    reason: "body requests a draft BL for checking",
  },
  {
    category: "comparison_request",
    source: "subject",
    pattern: /\b(?:to\s+)?confirm\s+docs?\b|\brequest\s+(?:the\s+)?(?:b\/?l|bill of lading)\s+draft\b|\bdraft\s+(?:b\/?l|bill of lading)\b[\s\S]{0,45}\b(?:check|confirm|verify|amend|review)\b/i,
    weight: 6,
    reason: "subject expresses document-comparison intent",
  },
  {
    category: "new_si_request",
    source: "body",
    pattern: /\b(?:please|kindly)\s+(?:send|provide|prepare|issue|share)\b[\s\S]{0,60}\b(?:new\s+)?(?:si|shipping instruction)\b|\b(?:si|shipping instruction)\b[\s\S]{0,40}\b(?:needed|required)\b/i,
    weight: 8,
    reason: "body asks for a shipping instruction",
  },
  {
    category: "new_si_request",
    source: "body",
    pattern: /\bplease\s+find\b[\s\S]{0,45}\bshipping instruction\b/i,
    weight: 7,
    reason: "body supplies a new shipping instruction",
  },
  {
    category: "new_si_request",
    source: "subject",
    pattern: /\b(?:request\s+si|cust(?:omer)?\s+si|si\s+needed|latest\s+si|new\s+si)\b|(?:^|[\s_-])si\s*[-_]/i,
    weight: 6,
    reason: "subject identifies a new SI request",
  },
  {
    category: "invoice_query",
    source: "body",
    pattern: /\b(?:invoice|billing|credit note|freight charge|local charge|detention|demurrage|d\s*&\s*d|thc)\b[\s\S]{0,100}\b(?:query|cancel|charge|amount|breakdown|payment|billed|missing|reverse|included|advise|confirm)\b|\b(?:query|cancel|breakdown|reverse)\b[\s\S]{0,80}\binvoice\b/i,
    weight: 8,
    reason: "body asks about an invoice or charge",
  },
  {
    category: "invoice_query",
    source: "subject",
    pattern: /\b(?:invoice|billing|credit note|local charges?|freight charges?|detention|demurrage|d\s*&\s*d|missing\s+gr|thc)\b/i,
    weight: 5,
    reason: "subject identifies an invoice or charge query",
  },
  {
    category: "spam",
    source: "body",
    pattern: /\b(?:won|winner|lottery|gift card|claim (?:your|now)|guaranteed \d+%|bank details|verify (?:your )?account|mailbox.{0,30}(?:full|limit)|bitcoin investment|hot singles|urgent business proposal)\b|https?:\/\/(?:bit\.ly|[^\s]+(?:claim|winner|verify|free-iphone|parcel)[^\s]*)/i,
    weight: 10,
    reason: "body contains a strong spam or phishing signal",
  },
  {
    category: "spam",
    source: "subject",
    pattern: /\b(?:won|winner|lottery|gift card|claim now|exclusive offer|mailbox.{0,20}full|verify account|undelivered messages|hot singles|bitcoin investment|weird trick|bank details)\b/i,
    weight: 7,
    reason: "subject contains a strong spam signal",
  },
  {
    category: "general_message",
    source: "body",
    pattern: /\b(?:daily berthing report|update summary|no action required|happy and prosperous new year|office resumes|outstanding (?:b\/?l|bill of lading)|submit si\s*&\s*aed|loading completed|delivery planning)\b/i,
    weight: 7,
    reason: "body matches a routine operational message",
  },
  {
    category: "general_message",
    source: "subject",
    pattern: /\b(?:daily berthing report|update summary|billing process completed|outstanding (?:b\/?l|bill of lading)|pending (?:b\/?l|bill of lading) release|time off request|new year|delivery planning|submit si\s*&\s*aed)\b/i,
    weight: 6,
    reason: "subject matches a routine operational message",
  },
];

function normaliseText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function currentMessageBody(body: string): string {
  const lines = body.split(/\r?\n/);
  const boundary = lines.findIndex((line) =>
    /^\s*(?:_{8,}|-{2,}\s*original message\s*-{2,}|from:\s+.+<[^>]+>|on .+ wrote:)\s*$/i.test(line)
  );
  return normaliseText((boundary >= 0 ? lines.slice(0, boundary) : lines).join("\n"));
}

export function deterministicClassify(record: InboxRecord): DeterministicDecision {
  const text = {
    subject: normaliseText(record.subject),
    body: currentMessageBody(record.body),
  };
  const scores: Record<DocumentCategory, number> = {
    comparison_request: 0,
    new_si_request: 0,
    invoice_query: 0,
    general_message: 0,
    spam: 0,
  };
  const matchedReasons: Record<DocumentCategory, string[]> = {
    comparison_request: [],
    new_si_request: [],
    invoice_query: [],
    general_message: [],
    spam: [],
  };

  for (const rule of RULES) {
    if (rule.pattern.test(text[rule.source])) {
      scores[rule.category] += rule.weight;
      matchedReasons[rule.category].push(rule.reason);
    }
  }

  const ranked = DOCUMENT_CATEGORIES
    .map((category) => ({ category, score: scores[category] }))
    .sort((left, right) => right.score - left.score);
  const [winner, runnerUp] = ranked;
  const isDecisive = winner.score >= 5 && winner.score - runnerUp.score >= 2;

  return {
    category: isDecisive ? winner.category : null,
    scores,
    reasons: isDecisive
      ? matchedReasons[winner.category]
      : [
        `ambiguous deterministic scores: ${ranked
          .filter((entry) => entry.score > 0)
          .map((entry) => `${entry.category}=${entry.score}`)
          .join(", ") || "no rule matched"}`,
      ],
  };
}

function senderFrom(record: InboxRecord): string {
  const metadataSender = record.metadata?.sender;
  return record.from ?? (typeof metadataSender === "string" ? metadataSender : "");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function intentHash(record: InboxRecord): Promise<string> {
  // Attachments are deliberately excluded: intent cannot change based on their presence.
  const intentInput = stableJson({
    subject: normaliseText(record.subject),
    body: currentMessageBody(record.body),
    sender: normaliseText(senderFrom(record)),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(intentInput),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isDocumentCategory(value: unknown): value is DocumentCategory {
  return typeof value === "string" &&
    DOCUMENT_CATEGORIES.includes(value as DocumentCategory);
}

export async function classifyInboxRecord(
  record: InboxRecord,
  options: ClassifierOptions = {},
): Promise<ClassificationResult> {
  const inputHash = await intentHash(record);
  const deterministic = deterministicClassify(record);

  if (deterministic.category) {
    return {
      category: deterministic.category,
      continue_to_extraction: deterministic.category === "comparison_request",
      method: "deterministic",
      classifier_version: CLASSIFIER_VERSION,
      model: null,
      input_hash: inputHash,
      cache_hit: false,
      reasons: deterministic.reasons,
      raw_model_output: null,
    };
  }

  const cached = await options.cache?.get(inputHash);
  if (cached) {
    return {
      category: cached.category,
      continue_to_extraction: cached.category === "comparison_request",
      method: cached.method,
      classifier_version: CLASSIFIER_VERSION,
      model: cached.model,
      input_hash: inputHash,
      cache_hit: true,
      reasons: cached.reasons,
      raw_model_output: cached.raw_model_output,
    };
  }

  if (!options.classifyWithModel) {
    throw new Error("Ambiguous message requires the configured OpenRouter classifier");
  }

  const modelDecision = await options.classifyWithModel({
    subject: record.subject,
    body: currentMessageBody(record.body),
    sender: senderFrom(record),
  });
  if (!isDocumentCategory(modelDecision.category)) {
    throw new Error("OpenRouter returned an unsupported document category");
  }

  const cachedDecision: CachedDecision = {
    category: modelDecision.category,
    method: "openrouter",
    model: modelDecision.model,
    reasons: [modelDecision.rationale, ...deterministic.reasons],
    raw_model_output: modelDecision.raw_output,
  };
  const finalDecision = options.cache
    ? await options.cache.save(inputHash, cachedDecision)
    : cachedDecision;

  return {
    category: finalDecision.category,
    continue_to_extraction: finalDecision.category === "comparison_request",
    method: finalDecision.method,
    classifier_version: CLASSIFIER_VERSION,
    model: finalDecision.model,
    input_hash: inputHash,
    cache_hit: false,
    reasons: finalDecision.reasons,
    raw_model_output: finalDecision.raw_model_output,
  };
}
