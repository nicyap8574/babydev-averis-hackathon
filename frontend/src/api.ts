import { supabase } from "./lib/supabase";
import { SUPABASE_TO_CATEGORY } from "./lib/categories";
import { contentTypeFor, sanitizeFileName, MAX_ATTACHMENT_BYTES, type AttachmentRecord } from "./lib/attachments";

/** PostgREST truncates at supabase/config.toml's `[api] max_rows` without
 *  raising, which would silently skew every count derived from these rows. */
const ROW_LIMIT = 2000;

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for this deployment.",
    );
  }
  return supabase;
}

export type Category =
  | "BL_COMPARISON"
  | "SI_REQUEST"
  | "INVOICE_QUERY"
  | "GENERAL"
  | "SPAM";

export type EmailStatus = "OK" | "MISMATCH" | "NEEDS_REVIEW";

export interface EmailListItem {
  id: string;
  subject: string;
  from: string;
  classification: Category;
  status: EmailStatus | null;
  mismatch_found: boolean;
  workflow_status: string;
  archived: boolean;
}

export interface FieldComparison {
  field: string;
  label: string;
  si_value: string | null;
  bl_value: string | null;
  status: "match" | "mismatch";
}

export interface EmailDetail {
  id: string;
  subject: string;
  from: string;
  category: Category;
  status: EmailStatus | null;
  workflow_status: string;
  last_error: string | null;
  attachment_names: string[];
  review_reason: string | null;
  fields: FieldComparison[];
  mismatches: string[];
}

export interface CaseCreation {
  emailId: string;
  category: Category | null;
  /** False when the classifier did not route this email to SI/BL extraction,
   *  which is a normal outcome rather than a failure. */
  comparisonRun: boolean;
  comparisonError: string | null;
}

export interface ReviewQueueItem {
  email_id: string;
  subject: string;
  reason: string | null;
  resolved: boolean;
  resolution: string | null;
}

// -- Supabase-backed path -----------------------------------------------------

export async function fetchEmails(options?: { archived?: boolean }): Promise<EmailListItem[]> {
  const db = requireSupabase();
  const archived = options?.archived ?? false;
  const { data, error } = await db
    .from("inbox_records")
    .select("email_id,subject,sender,category,status,workflow_status,archived")
    .eq("archived", archived)
    .limit(ROW_LIMIT);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.email_id as string,
    subject: (row.subject as string) ?? "",
    from: (row.sender as string) ?? "",
    classification: SUPABASE_TO_CATEGORY[row.category as string] ?? "GENERAL",
    status: row.status as EmailStatus | null,
    mismatch_found: row.status === "MISMATCH",
    workflow_status: row.workflow_status as string,
    archived: Boolean(row.archived),
  }));
}

export async function setEmailsArchived(emailIds: string[], archived: boolean): Promise<void> {
  if (emailIds.length === 0) return;
  const db = requireSupabase();
  const { error } = await db
    .from("inbox_records")
    .update({ archived })
    .in("email_id", emailIds);
  if (error) throw new Error(error.message);
}

export async function createCase(input: {
  subject: string;
  sender: string;
  body: string;
  files: File[];
}): Promise<CaseCreation> {
  const db = requireSupabase();
  const emailId = crypto.randomUUID();
  const attachments: AttachmentRecord[] = [];

  for (const file of input.files) {
    const contentType = contentTypeFor(file.name);
    if (!contentType) throw new Error(`${file.name} is not a supported file type.`);
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} exceeds the 20 MB per-file limit.`);
    const path = `${emailId}/${sanitizeFileName(file.name)}`;
    const { error } = await db.storage.from("case-attachments").upload(path, file, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
    attachments.push({ name: file.name, content_type: contentType, size_bytes: file.size, path });
  }

  // The Edge Function upserts the record itself with server-side credentials,
  // so there is no separate client insert to keep in step with it.
  const { data, error: classifyError } = await db.functions.invoke("identify-document-request", {
    body: {
      email_id: emailId,
      from: input.sender,
      subject: input.subject,
      body: input.body,
      attachments,
      metadata: { source: "web_form" },
    },
  });
  if (classifyError) {
    throw new Error(`Could not classify the case: ${classifyError.message}`);
  }

  const decision = data as { category?: string; continue_to_extraction?: boolean } | null;
  const category = SUPABASE_TO_CATEGORY[decision?.category ?? ""] ?? null;

  if (!decision?.continue_to_extraction) {
    return { emailId, category, comparisonRun: false, comparisonError: null };
  }

  // The comparison service re-reads the saved record and its private Storage
  // attachments using server-side credentials.
  try {
    const response = await fetch("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_id: emailId }),
    });
    if (!response.ok) {
      const failure = (await response.json().catch(() => null)) as { error?: unknown } | null;
      throw new Error(typeof failure?.error === "string" ? failure.error : `The comparison service returned ${response.status}.`);
    }
  } catch (error) {
    // The case is classified and in the inbox; only its verdict is missing.
    return {
      emailId,
      category,
      comparisonRun: true,
      comparisonError: error instanceof Error ? error.message : "The comparison service is unreachable.",
    };
  }
  return { emailId, category, comparisonRun: true, comparisonError: null };
}

export async function fetchEmailDetail(emailId: string): Promise<EmailDetail> {
  const db = requireSupabase();
  const { data, error } = await db
    .from("inbox_records")
    .select("email_id,subject,sender,category,status,workflow_status,last_error,attachments,review_reason,defect_fields,field_comparison")
    .eq("email_id", emailId)
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Email not found: ${emailId}`);

  return {
    id: data.email_id as string,
    subject: (data.subject as string) ?? "",
    from: (data.sender as string) ?? "",
    category: SUPABASE_TO_CATEGORY[data.category as string],
    status: data.status as EmailStatus | null,
    workflow_status: data.workflow_status as string,
    last_error: data.last_error as string | null,
    attachment_names: ((data.attachments as unknown[]) ?? []).map((attachment) =>
      typeof attachment === "string"
        ? attachment.split("/").pop() ?? attachment
        : typeof attachment === "object" && attachment !== null && "name" in attachment
          ? String(attachment.name)
          : "Attachment",
    ),
    review_reason: (data.review_reason as string | null) ?? null,
    fields: (data.field_comparison as FieldComparison[] | null) ?? [],
    mismatches: [...((data.defect_fields as string[] | null) ?? [])].sort(),
  };
}

export async function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  const db = requireSupabase();

  const [{ data: queueRows, error: queueError }, { data: subjectRows, error: subjectError }] =
    await Promise.all([
      db.from("review_queue_items").select("email_id,reason,resolved,resolution"),
      db.from("inbox_records").select("email_id,subject"),
    ]);
  if (queueError) throw new Error(queueError.message);
  if (subjectError) throw new Error(subjectError.message);

  const subjectByEmailId = new Map(
    (subjectRows ?? []).map((row) => [row.email_id as string, (row.subject as string) ?? ""]),
  );

  return (queueRows ?? []).map((row) => ({
    email_id: row.email_id as string,
    subject: subjectByEmailId.get(row.email_id as string) ?? "",
    reason: (row.reason as string | null) ?? null,
    resolved: Boolean(row.resolved),
    resolution: (row.resolution as string | null) ?? null,
  }));
}

function tally(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

export async function fetchDefectFieldCounts(): Promise<Record<string, number>> {
  const db = requireSupabase();
  const { data, error } = await db
    .from("inbox_records")
    .select("defect_fields")
    .eq("status", "MISMATCH");
  if (error) throw new Error(error.message);

  return tally((data ?? []).flatMap((row) => (row.defect_fields as string[] | null) ?? []));
}

export async function resolveReviewItem(
  emailId: string,
  resolution: string,
): Promise<ReviewQueueItem[]> {
  const db = requireSupabase();

  const { error: updateError } = await db
    .from("review_queue_items")
    .update({ resolved: true, resolution, resolved_at: new Date().toISOString() })
    .eq("email_id", emailId);
  if (updateError) throw new Error(updateError.message);

  const { error: insertError } = await db
    .from("review_resolutions")
    .insert({ email_id: emailId, resolution });
  if (insertError) throw new Error(insertError.message);

  return fetchReviewQueue();
}
