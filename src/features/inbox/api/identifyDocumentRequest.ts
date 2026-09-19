export type DocumentCategory =
  | "comparison_request"
  | "new_si_request"
  | "invoice_query"
  | "general_message"
  | "spam";

export interface InboxRecordInput {
  email_id: string;
  from?: string;
  subject: string;
  body: string;
  attachments: Array<
    | string
    | { name: string; content_type?: string; size_bytes?: number }
  >;
  metadata?: Record<string, unknown>;
}

export interface DocumentRequestDecision {
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

export async function identifyDocumentRequest(
  supabase: SupabaseClient,
  record: InboxRecordInput,
): Promise<DocumentRequestDecision> {
  const { data, error } = await supabase.functions.invoke<DocumentRequestDecision>(
    "identify-document-request",
    { body: record },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error("The classification function returned no decision");
  return data;
}
import type { SupabaseClient } from "@supabase/supabase-js";
