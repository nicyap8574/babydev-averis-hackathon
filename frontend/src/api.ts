import { supabase } from "./lib/supabase";
import { SUPABASE_TO_CATEGORY } from "./lib/categories";

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
  status: EmailStatus;
  mismatch_found: boolean;
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
  status: EmailStatus;
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

// -- local (no-Supabase-configured) fallback ---------------------------------
// pipeline.py writes this snapshot on every run (see _write_case_data_snapshot
// in sdoc-hackathon-bundle/pipeline.py) so the dashboard still works with
// zero external services, mirroring the classifier lab's own "local rules
// mode" fallback for when Supabase isn't configured.

interface LocalEmailRow {
  id: string;
  subject: string;
  from: string;
  category: Category;
  status: EmailStatus;
  review_reason: string | null;
  mismatches: string[];
  field_comparison: FieldComparison[];
}

interface LocalReviewRow {
  email_id: string;
  subject: string;
  reason: string | null;
  resolved: boolean;
  resolution: string | null;
}

interface LocalCaseData {
  emails: LocalEmailRow[];
  review_queue: LocalReviewRow[];
}

let localCaseDataPromise: Promise<LocalCaseData> | null = null;

function loadLocalCaseData(): Promise<LocalCaseData> {
  if (!localCaseDataPromise) {
    localCaseDataPromise = fetch("/case-data.json").then((response) => {
      if (!response.ok) {
        throw new Error(
          `No Supabase project configured, and case-data.json failed to load (${response.status}). ` +
          "Run pipeline.py at least once to generate it.",
        );
      }
      return response.json() as Promise<LocalCaseData>;
    });
  }
  return localCaseDataPromise;
}

async function fetchEmailsLocal(): Promise<EmailListItem[]> {
  const { emails } = await loadLocalCaseData();
  return emails.map((email) => ({
    id: email.id,
    subject: email.subject,
    from: email.from,
    classification: email.category,
    status: email.status,
    mismatch_found: email.status === "MISMATCH",
  }));
}

async function fetchEmailDetailLocal(emailId: string): Promise<EmailDetail> {
  const { emails } = await loadLocalCaseData();
  const email = emails.find((row) => row.id === emailId);
  if (!email) throw new Error(`Email not found: ${emailId}`);
  return {
    id: email.id,
    subject: email.subject,
    from: email.from,
    category: email.category,
    status: email.status,
    review_reason: email.review_reason,
    fields: email.field_comparison,
    mismatches: email.mismatches,
  };
}

async function fetchReviewQueueLocal(): Promise<ReviewQueueItem[]> {
  const { review_queue } = await loadLocalCaseData();
  return review_queue.map((row) => ({ ...row }));
}

async function resolveReviewItemLocal(
  emailId: string,
  resolution: string,
): Promise<ReviewQueueItem[]> {
  // There's no server to persist this to without Supabase configured, so
  // this only updates the in-memory snapshot for the rest of the session
  // (it resets on reload) rather than silently failing outright.
  const data = await loadLocalCaseData();
  const item = data.review_queue.find((row) => row.email_id === emailId);
  if (!item) throw new Error(`Email not in review queue: ${emailId}`);
  item.resolved = true;
  item.resolution = resolution;
  return fetchReviewQueueLocal();
}

// -- Supabase-backed path -----------------------------------------------------

export async function fetchEmails(): Promise<EmailListItem[]> {
  if (!supabase) return fetchEmailsLocal();

  const { data, error } = await supabase
    .from("inbox_records")
    .select("email_id,subject,sender,category,status")
    .not("status", "is", null);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.email_id as string,
    subject: (row.subject as string) ?? "",
    from: (row.sender as string) ?? "",
    classification: SUPABASE_TO_CATEGORY[row.category as string],
    status: row.status as EmailStatus,
    mismatch_found: row.status === "MISMATCH",
  }));
}

export async function fetchEmailDetail(emailId: string): Promise<EmailDetail> {
  if (!supabase) return fetchEmailDetailLocal(emailId);

  const { data, error } = await supabase
    .from("inbox_records")
    .select("email_id,subject,sender,category,status,review_reason,defect_fields,field_comparison")
    .eq("email_id", emailId)
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Email not found: ${emailId}`);

  return {
    id: data.email_id as string,
    subject: (data.subject as string) ?? "",
    from: (data.sender as string) ?? "",
    category: SUPABASE_TO_CATEGORY[data.category as string],
    status: data.status as EmailStatus,
    review_reason: (data.review_reason as string | null) ?? null,
    fields: (data.field_comparison as FieldComparison[] | null) ?? [],
    mismatches: [...((data.defect_fields as string[] | null) ?? [])].sort(),
  };
}

export async function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  if (!supabase) return fetchReviewQueueLocal();

  const [{ data: queueRows, error: queueError }, { data: subjectRows, error: subjectError }] =
    await Promise.all([
      supabase.from("review_queue_items").select("email_id,reason,resolved,resolution"),
      supabase.from("inbox_records").select("email_id,subject"),
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
  if (!supabase) {
    const { emails } = await loadLocalCaseData();
    return tally(emails.flatMap((email) => email.mismatches));
  }

  const { data, error } = await supabase
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
  if (!supabase) return resolveReviewItemLocal(emailId, resolution);

  const { error: updateError } = await supabase
    .from("review_queue_items")
    .update({ resolved: true, resolution, resolved_at: new Date().toISOString() })
    .eq("email_id", emailId);
  if (updateError) throw new Error(updateError.message);

  const { error: insertError } = await supabase
    .from("review_resolutions")
    .insert({ email_id: emailId, resolution });
  if (insertError) throw new Error(insertError.message);

  return fetchReviewQueue();
}
