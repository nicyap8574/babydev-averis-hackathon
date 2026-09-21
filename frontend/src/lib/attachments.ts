/** Attachment rules shared by single-case intake and batch ZIP ingest.
 *
 * The content types here are the `case-attachments` bucket's `allowed_mime_types`
 * (supabase/migrations/202609200002_shared_case_intake.sql); an upload with any
 * other type is rejected by Storage itself.
 */

export const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
};

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function contentTypeFor(fileName: string): string | undefined {
  return ALLOWED_CONTENT_TYPES[fileName.split(".").pop()?.toLowerCase() ?? ""];
}

/** Storage object keys only accept a restricted character set.
 *
 * This must preserve the `_SI` / `_BL` marker in the stem: the comparison
 * service identifies which document is which from the filename alone
 * (`is_document()` in frontend/api/compare.py).
 */
export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export interface AttachmentRecord {
  name: string;
  content_type: string;
  size_bytes: number;
  path: string;
}
