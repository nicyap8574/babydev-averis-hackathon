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
  created_at: string;
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

export interface CaseAttachment {
  name: string;
  path: string;
  content_type: string | null;
  size_bytes: number | null;
}

export interface EmailDetail {
  id: string;
  subject: string;
  from: string;
  category: Category;
  status: EmailStatus | null;
  workflow_status: string;
  last_error: string | null;
  attachments: CaseAttachment[];
  review_reason: string | null;
  fields: FieldComparison[];
  mismatches: string[];
  review_history?: ReviewHistoryItem[];
  report_type?: "automated_mismatch" | "reviewed_escalation";
  completed_at?: string;
}

export interface ReviewHistoryItem {
  id: string;
  resolution: string;
  created_at: string;
  reviewer_label: "Human reviewer";
}

export interface ReportListItem {
  email_id: string;
  subject: string;
  sender: string;
  report_type: "automated_mismatch" | "reviewed_escalation";
  verdict: "MISMATCH" | "RESOLVED_AFTER_REVIEW";
  mismatch_count: number;
  completed_at: string;
  latest_resolution: string | null;
}

export interface ReportPage {
  items: ReportListItem[];
  total: number;
}

function attachmentFromRecord(attachment: unknown): CaseAttachment {
  if (typeof attachment === "string") {
    return {
      name: attachment.split("/").pop() ?? attachment,
      path: attachment,
      content_type: null,
      size_bytes: null,
    };
  }
  if (typeof attachment === "object" && attachment !== null && "path" in attachment) {
    const value = attachment as Record<string, unknown>;
    const path = typeof value.path === "string" ? value.path : "";
    return {
      name: typeof value.name === "string" ? value.name : path.split("/").pop() ?? "Attachment",
      path,
      content_type: typeof value.content_type === "string" ? value.content_type : null,
      size_bytes: typeof value.size_bytes === "number" ? value.size_bytes : null,
    };
  }
  return { name: "Attachment", path: "", content_type: null, size_bytes: null };
}

export async function createAttachmentSignedUrl(attachment: CaseAttachment): Promise<string> {
  if (!attachment.path) throw new Error("This attachment has no storage path.");
  const db = requireSupabase();
  const { data, error } = await db.storage.from("case-attachments").createSignedUrl(attachment.path, 600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not open this attachment.");
  return data.signedUrl;
}

export async function downloadAttachment(attachment: CaseAttachment): Promise<Blob> {
  if (!attachment.path) throw new Error("This attachment has no storage path.");
  const db = requireSupabase();
  const { data, error } = await db.storage.from("case-attachments").download(attachment.path);
  if (error || !data) throw new Error(error?.message ?? "Could not download this attachment.");
  return data;
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
    .select("email_id,subject,sender,created_at,category,status,workflow_status,archived")
    .eq("archived", archived)
    .limit(ROW_LIMIT);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.email_id as string,
    subject: (row.subject as string) ?? "",
    from: (row.sender as string) ?? "",
    created_at: (row.created_at as string) ?? "",
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
    attachments: ((data.attachments as unknown[]) ?? []).map(attachmentFromRecord).filter((attachment) => Boolean(attachment.path)),
    review_reason: (data.review_reason as string | null) ?? null,
    fields: (data.field_comparison as FieldComparison[] | null) ?? [],
    mismatches: [...((data.defect_fields as string[] | null) ?? [])].sort(),
  };
}

export async function fetchReports(options: { search?: string; page?: number; pageSize?: number; completedAtAscending?: boolean } = {}): Promise<ReportPage> {
  const db = requireSupabase();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 12));
  let query = db
    .from("verification_reports")
    .select("email_id,subject,sender,report_type,verdict,mismatches,completed_at", { count: "exact" })
    .order("completed_at", { ascending: options.completedAtAscending ?? false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const search = options.search?.trim();
  if (search) {
    // PostgREST's `or` syntax treats commas and parentheses as operators.
    const safeSearch = search.replace(/[%,()]/g, "");
    if (safeSearch) query = query.or(`sender.ilike.%${safeSearch}%,subject.ilike.%${safeSearch}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const ids = rows.map((row) => row.email_id as string);
  const { data: resolutions, error: resolutionError } = ids.length === 0
    ? { data: [], error: null }
    : await db.from("review_resolutions").select("email_id,resolution,created_at").in("email_id", ids).order("created_at", { ascending: false });
  if (resolutionError) throw new Error(resolutionError.message);

  const latestResolution = new Map<string, string>();
  for (const resolution of resolutions ?? []) {
    const emailId = resolution.email_id as string;
    if (!latestResolution.has(emailId)) latestResolution.set(emailId, resolution.resolution as string);
  }

  return {
    total: count ?? 0,
    items: rows.map((row) => ({
      email_id: row.email_id as string,
      subject: (row.subject as string) ?? "",
      sender: (row.sender as string) ?? "",
      report_type: row.report_type as ReportListItem["report_type"],
      verdict: row.verdict as ReportListItem["verdict"],
      mismatch_count: ((row.mismatches as string[] | null) ?? []).length,
      completed_at: row.completed_at as string,
      latest_resolution: latestResolution.get(row.email_id as string) ?? null,
    })),
  };
}

export async function fetchReportDetail(emailId: string): Promise<EmailDetail> {
  const db = requireSupabase();
  const [{ data: report, error: reportError }, { data: history, error: historyError }] = await Promise.all([
    db.from("verification_reports")
      .select("email_id,subject,sender,report_type,status,review_reason,mismatches,field_comparison,attachments,completed_at")
      .eq("email_id", emailId)
      .single(),
    db.from("review_resolutions")
      .select("id,resolution,created_at")
      .eq("email_id", emailId)
      .order("created_at", { ascending: true }),
  ]);
  if (reportError) throw new Error(reportError.message);
  if (historyError) throw new Error(historyError.message);
  if (!report) throw new Error(`Report not found: ${emailId}`);

  return {
    id: report.email_id as string,
    subject: (report.subject as string) ?? "",
    from: (report.sender as string) ?? "",
    category: "BL_COMPARISON",
    status: (report.status as EmailStatus | null) ?? "MISMATCH",
    workflow_status: "report_completed",
    last_error: null,
    attachments: ((report.attachments as unknown[]) ?? []).map(attachmentFromRecord).filter((attachment) => Boolean(attachment.path)),
    review_reason: (report.review_reason as string | null) ?? null,
    fields: (report.field_comparison as FieldComparison[] | null) ?? [],
    mismatches: [...((report.mismatches as string[] | null) ?? [])].sort(),
    report_type: report.report_type as EmailDetail["report_type"],
    completed_at: report.completed_at as string,
    review_history: (history ?? []).map((item) => ({
      id: item.id as string,
      resolution: item.resolution as string,
      created_at: item.created_at as string,
      reviewer_label: "Human reviewer",
    })),
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

  const { error } = await db.rpc("resolve_review_item", {
    p_email_id: emailId,
    p_resolution: resolution,
  });
  if (error) throw new Error(error.message);

  return fetchReviewQueue();
}
