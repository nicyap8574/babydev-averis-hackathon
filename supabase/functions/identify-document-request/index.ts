import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  classifyInboxRecord,
  isDocumentCategory,
  type CachedDecision,
  type DecisionCache,
  type InboxRecord,
} from "../_shared/document-classifier.ts";
import { classifyWithProvider } from "./providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseInboxRecord(value: unknown): InboxRecord {
  if (value === null || typeof value !== "object") {
    throw new Error("Request body must be an inbox record");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.email_id !== "string" || !record.email_id.trim() ||
    typeof record.subject !== "string" ||
    typeof record.body !== "string" ||
    !Array.isArray(record.attachments)
  ) {
    throw new Error("email_id, subject, body, and attachments are required");
  }
  const validAttachments = record.attachments.every((attachment) =>
    typeof attachment === "string" ||
    (attachment !== null && typeof attachment === "object" &&
      typeof (attachment as { name?: unknown }).name === "string")
  );
  if (!validAttachments) {
    throw new Error("Each attachment must be a path or an object with a name");
  }
  if (
    record.metadata !== undefined &&
    (record.metadata === null || typeof record.metadata !== "object" || Array.isArray(record.metadata))
  ) {
    throw new Error("metadata must be an object when provided");
  }

  return {
    email_id: record.email_id,
    from: typeof record.from === "string" ? record.from : undefined,
    subject: record.subject,
    body: record.body,
    attachments: record.attachments as InboxRecord["attachments"],
    metadata: record.metadata as Record<string, unknown> | undefined,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let record: InboxRecord | null = null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase environment is not configured" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    record = parseInboxRecord(await request.json());
    const sender = record.from ??
      (typeof record.metadata?.sender === "string" ? record.metadata.sender : null);

    const { error: startError } = await supabase.from("inbox_records").upsert({
      email_id: record.email_id,
      sender,
      subject: record.subject,
      body: record.body,
      attachments: record.attachments,
      metadata: record.metadata ?? {},
      workflow_status: "classifying",
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "email_id" });
    if (startError) {
      throw new Error(`Could not start classification: ${startError.message}`);
    }

    const cache: DecisionCache = {
      async get(inputHash) {
        const { data, error } = await supabase
          .from("classification_decisions")
          .select("category, method, model, reasons, raw_model_output")
          .eq("input_hash", inputHash)
          .maybeSingle();
        if (error) throw new Error(`Could not read decision cache: ${error.message}`);
        if (!data) return null;
        if (!isDocumentCategory(data.category) || !["groq", "nvidia", "cerebras", "legacy"].includes(data.method)) return null;
        return {
          category: data.category,
          method: data.method as CachedDecision["method"],
          model: data.model,
          reasons: Array.isArray(data.reasons) ? data.reasons : [],
          raw_model_output: data.raw_model_output,
        } satisfies CachedDecision;
      },
      async save(inputHash, decision) {
        const { error } = await supabase.from("classification_decisions").upsert({
          input_hash: inputHash,
          category: decision.category,
          continue_to_extraction: decision.category === "comparison_request",
          method: decision.method,
          model: decision.model,
          reasons: decision.reasons,
          raw_model_output: decision.raw_model_output,
        }, { onConflict: "input_hash", ignoreDuplicates: true });
        if (error) throw new Error(`Could not save decision cache: ${error.message}`);

        const authoritative = await this.get(inputHash);
        if (!authoritative) {
          throw new Error("Could not read the saved classification decision");
        }
        return authoritative;
      },
    };

    const result = await classifyInboxRecord(record, {
      cache,
      classifyWithModel: classifyWithProvider,
    });
    const workflowStatus = result.continue_to_extraction
      ? "ready_for_extraction"
      : "classification_complete";

    const { error: finishError } = await supabase.from("inbox_records").update({
      workflow_status: workflowStatus,
      category: result.category,
      continue_to_extraction: result.continue_to_extraction,
      classification_method: result.method,
      classifier_version: result.classifier_version,
      classification_input_hash: result.input_hash,
      classified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("email_id", record.email_id);
    if (finishError) {
      throw new Error(`Could not finish classification: ${finishError.message}`);
    }

    const { error: auditError } = await supabase.from("classification_runs").insert({
      email_id: record.email_id,
      input_hash: result.input_hash,
      category: result.category,
      continue_to_extraction: result.continue_to_extraction,
      method: result.method,
      classifier_version: result.classifier_version,
      model: result.model,
      cache_hit: result.cache_hit,
      reasons: result.reasons,
      raw_model_output: result.raw_model_output,
    });
    if (auditError) {
      throw new Error(`Could not write classification audit: ${auditError.message}`);
    }

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification failed";
    if (record) {
      await supabase.from("inbox_records").update({
        workflow_status: "classification_failed",
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq("email_id", record.email_id);
    }
    const status = message.includes("required") || message.includes("must be") ? 400 : 502;
    return jsonResponse({ error: message }, status);
  }
});
