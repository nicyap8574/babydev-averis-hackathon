/** Drives a batch ZIP through the same path a single case takes.
 *
 * Attachments go to Storage with the browser's publishable key, then each
 * record is handed to the `identify-document-request` Edge Function, which
 * upserts it with server-side credentials — so the browser never inserts into
 * inbox_records itself and a repeat upload updates rows instead of duplicating
 * them. Comparison cases then go to /api/compare, exactly as createCase does.
 */
import { unzip } from "fflate";
import { supabase } from "./supabase";
import { attachmentRecords, parseBundle, type BundleEmail } from "./batchBundle";
import { MAX_ATTACHMENT_BYTES } from "./attachments";

const CONCURRENCY = 6;
/** A stalled provider cascade can hold one classify call open for minutes;
 *  functions.invoke exposes no abort signal, so give up on it client-side. */
const PER_EMAIL_TIMEOUT_MS = 60_000;

export type BatchPhase = "reading" | "uploading" | "classifying" | "comparing" | "done";

export interface BatchProgress {
  phase: BatchPhase;
  completed: number;
  total: number;
}

export interface BatchFailure {
  emailId: string;
  message: string;
}

export interface BatchResult {
  total: number;
  /** Emails stored and classified. Comparison is a separate step: a case whose
   *  comparison could not run is still in the workspace, awaiting one. */
  ingested: number;
  comparisonsAttempted: number;
  comparisonsCompleted: number;
  failures: BatchFailure[];
  comparisonFailures: BatchFailure[];
  warnings: string[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${PER_EMAIL_TIMEOUT_MS / 1000}s`)), PER_EMAIL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Runs `worker` over `items` with a bounded number in flight, reporting each
 *  completion. Never rejects: a failed item is returned, not thrown. */
async function pooled<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  onDone: () => void,
  failureFor: (item: T, error: unknown) => BatchFailure,
): Promise<BatchFailure[]> {
  const failures: BatchFailure[] = [];
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (error) {
        failures.push(failureFor(item, error));
      }
      onDone();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
  return failures;
}

async function readZip(file: File): Promise<Record<string, Uint8Array>> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    unzip(buffer, (error, entries) => {
      if (error) reject(new Error(`Could not read ${file.name} as a ZIP archive.`));
      else resolve(entries);
    });
  });
}

async function uploadAttachments(email: BundleEmail, db: NonNullable<typeof supabase>): Promise<void> {
  for (const attachment of email.attachments) {
    if (attachment.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Error(`${attachment.name} exceeds the 20 MB per-file limit.`);
    }
    const blob = new Blob([attachment.bytes as unknown as BlobPart], { type: attachment.contentType });
    const { error } = await db.storage
      .from("case-attachments")
      .upload(attachment.storagePath, blob, { contentType: attachment.contentType, upsert: false });
    // The storage path is deterministic, so a repeat ingest finds its own
    // earlier upload already there. That is success, not a failure.
    if (error && (error as { statusCode?: string }).statusCode !== "409") {
      throw new Error(`Could not upload ${attachment.name}: ${error.message}`);
    }
  }
}

export async function ingestBundle(
  file: File,
  onProgress: (progress: BatchProgress) => void,
): Promise<BatchResult> {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for this deployment.");
  }
  const db = supabase;

  onProgress({ phase: "reading", completed: 0, total: 0 });
  const { emails, warnings } = parseBundle(await readZip(file));
  const batchId = crypto.randomUUID();
  const total = emails.length;

  let completed = 0;
  const report = (phase: BatchPhase) => () => onProgress({ phase, completed: ++completed, total });

  completed = 0;
  const uploadFailures = await pooled(
    emails,
    (email) => uploadAttachments(email, db),
    report("uploading"),
    (email, error) => ({ emailId: email.emailId, message: message(error) }),
  );
  const uploaded = emails.filter((email) => !uploadFailures.some((failure) => failure.emailId === email.emailId));

  // Emails the classifier routes to extraction are the ones worth comparing.
  const toCompare: BundleEmail[] = [];
  completed = 0;
  const classifyFailures = await pooled(
    uploaded,
    async (email) => {
      const { data, error } = await withTimeout(
        db.functions.invoke("identify-document-request", {
          body: {
            email_id: email.emailId,
            from: email.sender,
            subject: email.subject,
            body: email.body,
            attachments: attachmentRecords(email),
            metadata: { source: "batch_zip", batch_id: batchId },
          },
        }),
        "Classification",
      );
      if (error) throw new Error(error.message);
      if ((data as { continue_to_extraction?: boolean } | null)?.continue_to_extraction) {
        toCompare.push(email);
      }
    },
    report("classifying"),
    (email, error) => ({ emailId: email.emailId, message: message(error) }),
  );

  completed = 0;
  const compareFailures = await pooled(
    toCompare,
    async (email) => {
      let response: Response;
      try {
        response = await withTimeout(
          fetch("/api/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email_id: email.emailId }),
          }),
          "Comparison",
        );
      } catch {
        throw new Error("The comparison service is unreachable. Under `vite dev` it has to be run separately; see vite.config.ts.");
      }
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { error?: unknown } | null;
        if (typeof failure?.error === "string") throw new Error(failure.error);
        throw new Error(`The comparison service returned ${response.status}.`);
      }
    },
    report("comparing"),
    (email, error) => ({ emailId: email.emailId, message: message(error) }),
  );

  const failures = [...uploadFailures, ...classifyFailures];
  onProgress({ phase: "done", completed: total, total });
  return {
    total,
    ingested: total - new Set(failures.map((failure) => failure.emailId)).size,
    comparisonsAttempted: toCompare.length,
    comparisonsCompleted: toCompare.length - compareFailures.length,
    failures,
    comparisonFailures: compareFailures,
    warnings,
  };
}
