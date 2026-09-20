import { supabase } from "./lib/supabase";
import { SUPABASE_TO_CATEGORY } from "./lib/categories";

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

export interface ReviewQueueItem {
  email_id: string;
  subject: string;
  reason: string | null;
  resolved: boolean;
  resolution: string | null;
}

// -- Supabase-backed path -----------------------------------------------------

export async function fetchEmails(): Promise<EmailListItem[]> {
  const db = requireSupabase();
  const { data, error } = await db
    .from("inbox_records")
    .select("email_id,subject,sender,category,status,workflow_status");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.email_id as string,
    subject: (row.subject as string) ?? "",
    from: (row.sender as string) ?? "",
    classification: SUPABASE_TO_CATEGORY[row.category as string] ?? "GENERAL",
    status: row.status as EmailStatus | null,
    mismatch_found: row.status === "MISMATCH",
    workflow_status: row.workflow_status as string,
  }));
}

export async function createCase(input: {
  subject: string;
  sender: string;
  body: string;
  files: File[];
}): Promise<string> {
  const db = requireSupabase();
  const emailId = crypto.randomUUID();
  const attachments: { name: string; content_type: string; size_bytes: number; path: string }[] = [];
  const allowedTypes: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    csv: "text/csv",
  };

  for (const file of input.files) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const contentType = allowedTypes[extension];
    if (!contentType) throw new Error(`${file.name} is not a supported file type.`);
    if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds the 20 MB per-file limit.`);
    const path = `${emailId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await db.storage.from("case-attachments").upload(path, file, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
    attachments.push({ name: file.name, content_type: contentType, size_bytes: file.size, path });
  }

  const { error: insertError } = await db.from("inbox_records").insert({
    email_id: emailId,
    sender: input.sender,
    subject: input.subject,
    body: input.body,
    attachments,
    metadata: { source: "web_form" },
  });
  if (insertError) {
    await db.storage.from("case-attachments").remove(attachments.map((attachment) => attachment.path));
    throw new Error(`Could not save the case: ${insertError.message}`);
  }

  const { error: classifyError } = await db.functions.invoke("identify-document-request", {
    body: { email_id: emailId, from: input.sender, subject: input.subject, body: input.body, attachments },
  });
  if (classifyError) {
    throw new Error(`Case saved, but classification failed: ${classifyError.message}. The saved case remains in the inbox.`);
  }

  // The comparison service re-reads the saved record and its private Storage
  // attachments using server-side credentials. It is safe to call for every
  // case: non-comparison categories return immediately.
  const comparisonResponse = await fetch("/api/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email_id: emailId }),
  });
  if (!comparisonResponse.ok) {
    const failure = await comparisonResponse.json().catch(() => null) as { error?: unknown } | null;
    const message = typeof failure?.error === "string" ? failure.error : "The document comparison service could not complete.";
    throw new Error(`Case saved and classified, but comparison failed: ${message}`);
  }
  return emailId;
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
