import { isDocumentCategory, type ModelDecision } from "../_shared/document-classifier.ts";

type Provider = { name: "groq" | "nvidia" | "cerebras"; url: string; key: string; model: string };

const providers: Provider[] = [
  { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: Deno.env.get("GROQ_API_KEY") ?? "", model: "openai/gpt-oss-120b" },
  { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: Deno.env.get("GROQ_API_KEY") ?? "", model: "llama-3.3-70b-versatile" },
  { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: Deno.env.get("GROQ_API_KEY") ?? "", model: "qwen/qwen3.8-27b" },
  { name: "nvidia", url: "https://integrate.api.nvidia.com/v1/chat/completions", key: Deno.env.get("NVIDIA_API_KEY") ?? "", model: "nvidia/nemotron-3-ultra-550b-a55b" },
  { name: "cerebras", url: "https://api.cerebras.ai/v1/chat/completions", key: Deno.env.get("CEREBRAS_API_KEY") ?? "", model: "qwen-3-32b" },
];

const labels = ["comparison_request", "new_si_request", "invoice_query", "general_message", "spam"];

function parsePayload(raw: unknown): { category: string; rationale: string } | null {
  const content = (raw as { choices?: Array<{ message?: { content?: unknown } }> })
    .choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
    if (isDocumentCategory(parsed?.category) && typeof parsed?.rationale === "string") return parsed;
    if (typeof parsed === "string" && labels.includes(parsed)) return { category: parsed, rationale: "Provider category result" };
  } catch { /* try a later provider */ }
  return null;
}

export async function classifyWithProvider(input: { subject: string; body: string; sender: string }): Promise<ModelDecision> {
  const failures: string[] = [];
  for (const provider of providers) {
    if (!provider.key) continue;
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0,
          max_tokens: 180,
          messages: [
            { role: "system", content: `Classify the current email into exactly one category: ${labels.join(", ")}. comparison_request: asks for SI versus BL comparison. new_si_request: requests or supplies a shipping instruction. invoice_query: invoices or charges. general_message: routine correspondence. spam: unsolicited or fraudulent mail. Ignore quoted history and attachments. Return only JSON: {"category":"one allowed category","rationale":"short reason"}.` },
            { role: "user", content: JSON.stringify(input) },
          ],
        }),
        signal: AbortSignal.timeout(25000),
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = parsePayload(raw);
      if (!result) throw new Error("invalid classification response");
      return { ...result, category: result.category as ModelDecision["category"], raw_output: raw, model: `${provider.name}/${provider.model}` };
    } catch (error) {
      failures.push(`${provider.name}/${provider.model}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }
  if (failures.length) throw new Error(`Classifier providers failed: ${failures.join("; ")}`);
  throw new Error("Classifier API keys are missing. Configure GROQ_API_KEY, NVIDIA_API_KEY, or CEREBRAS_API_KEY as Supabase function secrets.");
}
