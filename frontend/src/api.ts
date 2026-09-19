const API_BASE = "http://127.0.0.1:8000";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function fetchEmails(): Promise<EmailListItem[]> {
  return request<EmailListItem[]>("/emails");
}

export function fetchEmailDetail(emailId: string): Promise<EmailDetail> {
  return request<EmailDetail>(`/emails/${emailId}`);
}

export function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  return request<ReviewQueueItem[]>("/review-queue");
}

export function resolveReviewItem(
  emailId: string,
  resolution: string,
): Promise<ReviewQueueItem[]> {
  return request<ReviewQueueItem[]>(`/review-queue/${emailId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution }),
  });
}
