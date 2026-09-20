import {
  isDocumentCategory,
  type ModelDecision,
} from "../_shared/document-classifier.ts";

export const OPENROUTER_MODEL = "google/gemini-2.0-flash-001";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterInput {
  subject: string;
  body: string;
  sender: string;
}

export async function classifyWithOpenRouter(
  input: OpenRouterInput,
  apiKey: string,
): Promise<ModelDecision> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "DocWise document request classifier",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0,
      seed: 20260919,
      max_tokens: 140,
      provider: {
        require_parameters: true,
      },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "document_request_classification",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              category: {
                type: "string",
                enum: [
                  "comparison_request",
                  "new_si_request",
                  "invoice_query",
                  "general_message",
                  "spam",
                ],
              },
              rationale: {
                type: "string",
                description: "One short reason based on sender, subject, and current message body.",
              },
            },
            required: ["category", "rationale"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content: [
            "Classify the current email intent into exactly one allowed category.",
            "comparison_request means the sender wants an SI checked against a BL, including a request for a draft BL so it can be checked.",
            "new_si_request means the sender asks for or supplies a new shipping instruction without asking for an SI-versus-BL comparison.",
            "invoice_query concerns invoices, billing, or charges.",
            "general_message is routine operational or personal correspondence.",
            "spam is unsolicited marketing, fraud, or phishing.",
            "Prefer the current body over a misleading subject or quoted history.",
            "Attachment presence is intentionally unavailable and must not influence the category.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    }),
  });

  let rawOutput: unknown;
  try {
    rawOutput = await response.json();
  } catch {
    rawOutput = { unreadable_response: true, status: response.status };
  }

  if (!response.ok) {
    throw new Error(`OpenRouter classification failed with status ${response.status}`);
  }

  const content = (rawOutput as {
    choices?: Array<{ message?: { content?: unknown } }>;
  }).choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenRouter returned no structured classification content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenRouter returned invalid classification JSON");
  }

  const category = (parsed as { category?: unknown }).category;
  const rationale = (parsed as { rationale?: unknown }).rationale;
  if (!isDocumentCategory(category) || typeof rationale !== "string") {
    throw new Error("OpenRouter returned an invalid classification payload");
  }

  return {
    category,
    rationale,
    raw_output: rawOutput,
    model: OPENROUTER_MODEL,
  };
}
