/** Parses an unzipped evaluation bundle into inbox records.
 *
 * Deliberately free of browser and Supabase APIs so it can be unit-tested
 * under `node --test`; the caller supplies the already-decompressed entries.
 *
 * The expected layout is the one `sdoc-hackathon-bundle/` uses, with or
 * without a wrapping folder:
 *
 *     <root>/inbox/email_001.json        { email_id, from, subject, body, attachments }
 *     <root>/attachments/email_001_SI.txt
 *
 * Each record's `attachments` entries are paths relative to <root>.
 */
// Explicit extension: this module is also loaded directly by node --test,
// which does not resolve extensionless TypeScript imports.
import { contentTypeFor, sanitizeFileName } from "./attachments.ts";

export interface BundleAttachment {
  name: string;
  contentType: string;
  bytes: Uint8Array;
  /** Storage object key. Deterministic, so re-ingesting the same bundle
   *  overwrites nothing and leaves no orphaned objects behind. */
  storagePath: string;
}

export interface BundleEmail {
  emailId: string;
  sender: string;
  subject: string;
  body: string;
  attachments: BundleAttachment[];
}

export interface ParsedBundle {
  emails: BundleEmail[];
  warnings: string[];
}

/** Guards against an archive that is not the bundle at all. Generous enough
 *  for the real one (791 entries, 4.3 MB) with room to spare. */
export const MAX_ENTRIES = 20_000;
export const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

const EMAIL_ENTRY = /(^|\/)inbox\/email_[^/]*\.json$/;

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/** The bundle root is whatever precedes `inbox/`, so both `inbox/x.json` and
 *  `some-folder/inbox/x.json` resolve their attachments correctly. */
function rootOf(entryPath: string): string {
  const index = entryPath.lastIndexOf("inbox/");
  return index <= 0 ? "" : entryPath.slice(0, index);
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === "string") ? (value as string[]) : null;
}

export function parseBundle(entries: Record<string, Uint8Array>): ParsedBundle {
  const warnings: string[] = [];
  const paths = Object.keys(entries);

  if (paths.length > MAX_ENTRIES) {
    throw new Error(`This archive has ${paths.length} files, more than the ${MAX_ENTRIES} a bundle should contain.`);
  }
  let totalBytes = 0;
  for (const path of paths) totalBytes += entries[path].byteLength;
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error(`This archive expands to ${Math.round(totalBytes / 1048576)} MB, more than the ${MAX_TOTAL_BYTES / 1048576} MB limit.`);
  }

  const emailPaths = paths.filter((path) => EMAIL_ENTRY.test(path)).sort();
  if (emailPaths.length === 0) {
    throw new Error("No inbox/email_*.json files found. Expected a bundle with an inbox folder.");
  }

  const emails: BundleEmail[] = [];
  const seen = new Set<string>();

  for (const entryPath of emailPaths) {
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(decodeText(entries[entryPath])) as Record<string, unknown>;
    } catch {
      warnings.push(`${entryPath}: not valid JSON, skipped.`);
      continue;
    }

    const emailId = typeof record.email_id === "string" ? record.email_id.trim() : "";
    const subject = typeof record.subject === "string" ? record.subject : "";
    const body = typeof record.body === "string" ? record.body : "";
    const attachmentPaths = asStringArray(record.attachments ?? []);

    if (!emailId || attachmentPaths === null) {
      warnings.push(`${entryPath}: missing email_id or malformed attachments, skipped.`);
      continue;
    }
    if (seen.has(emailId)) {
      warnings.push(`${entryPath}: duplicate email_id "${emailId}", skipped.`);
      continue;
    }
    seen.add(emailId);

    const root = rootOf(entryPath);
    const attachments: BundleAttachment[] = [];
    for (const relativePath of attachmentPaths) {
      const name = relativePath.split("/").pop() ?? relativePath;
      const contentType = contentTypeFor(name);
      if (!contentType) {
        warnings.push(`${emailId}: ${name} is not a supported file type, skipped.`);
        continue;
      }
      const bytes = entries[`${root}${relativePath}`];
      if (!bytes) {
        warnings.push(`${emailId}: ${relativePath} is referenced but not in the archive.`);
        continue;
      }
      attachments.push({
        name,
        contentType,
        bytes,
        storagePath: `${emailId}/${sanitizeFileName(name)}`,
      });
    }

    emails.push({
      emailId,
      sender: typeof record.from === "string" ? record.from : "",
      subject,
      body,
      attachments,
    });
  }

  if (emails.length === 0) {
    throw new Error("No usable emails found in this archive.");
  }
  return { emails, warnings };
}

/** The record shape the Edge Function upserts and the comparison service reads.
 *
 * The `path` must be the Storage key and each entry must be an object: the
 * Edge Function also accepts a bare string array, but compare.py only reads
 * dict items carrying a string `path`, so a string array silently reports
 * every comparison as having no attachments at all.
 */
export function attachmentRecords(email: BundleEmail) {
  return email.attachments.map((attachment) => ({
    name: attachment.name,
    content_type: attachment.contentType,
    size_bytes: attachment.bytes.byteLength,
    path: attachment.storagePath,
  }));
}
