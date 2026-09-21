import { useState, type FormEvent } from "react";
import { Icon } from "./IconSprite";
import type { BatchProgress, BatchResult } from "../lib/batchIngest";

interface BatchUploadModalProps {
  running: boolean;
  progress: BatchProgress | null;
  result: BatchResult | null;
  error: string | null;
  onClose: () => void;
  onSubmit: (file: File) => Promise<void>;
}

const PHASE_LABELS: Record<BatchProgress["phase"], string> = {
  reading: "Reading the archive…",
  uploading: "Uploading documents",
  classifying: "Classifying emails",
  comparing: "Comparing SI and BL documents",
  done: "Finished",
};

export function BatchUploadModal({ running, progress, result, error, onClose, onSubmit }: BatchUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [showFailures, setShowFailures] = useState(false);


  async function submit(event: FormEvent) {
    event.preventDefault();
    if (file) await onSubmit(file);
  }

  function close() {
    setFile(null);
    setShowFailures(false);
    onClose();
  }

  const percent = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <div
      className="modal-backdrop open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-upload-title"
      onClick={(event) => { if (event.target === event.currentTarget && !running) close(); }}
    >
      <form className="modal new-case-modal" onSubmit={submit}>
        <header className="modal-header">
          <div>
            <h2 id="batch-upload-title">Upload a batch</h2>
            <p>Load a whole evaluation bundle at once instead of creating cases one by one.</p>
          </div>
          <button type="button" className="icon-button" onClick={close} disabled={running} aria-label="Close">×</button>
        </header>

        <div className="new-case-fields">
          <div className="attachment-field">
            <span className="field-label">Bundle archive <span className="muted">(a .zip containing an inbox folder)</span></span>
            <label className="file-picker">
              <input
                className="file-picker-input"
                type="file"
                accept=".zip,application/zip"
                disabled={running || result !== null}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <span className="file-picker-button"><Icon id="i-upload" />Choose archive</span>
              <span className="file-picker-status">{file ? file.name : "No archive selected"}</span>
            </label>
          </div>

          {progress && (
            <div className="batch-progress" role="status" aria-live="polite">
              <div className="batch-progress-row">
                <span>{PHASE_LABELS[progress.phase]}</span>
                {progress.total > 0 && <span className="muted">{progress.completed} / {progress.total}</span>}
              </div>
              <div className="batch-progress-track">
                <div className="batch-progress-bar" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}

          {result && (
            <>
              <p className="batch-summary">
                <Icon id="i-check" />
                {result.ingested} of {result.total} email{result.total === 1 ? "" : "s"} ingested.
              </p>
              {result.comparisonsAttempted > 0 && (
                <p className={result.comparisonFailures.length > 0 ? "form-error" : "batch-summary"} role={result.comparisonFailures.length > 0 ? "alert" : undefined}>
                  <Icon id={result.comparisonFailures.length > 0 ? "i-info" : "i-check"} />
                  {result.comparisonsCompleted} of {result.comparisonsAttempted} comparison
                  {result.comparisonsAttempted === 1 ? "" : "s"} completed
                  {result.comparisonFailures.length > 0 ? ". Those cases are in the workspace awaiting comparison." : "."}
                </p>
              )}
              {(result.failures.length > 0 || result.comparisonFailures.length > 0 || result.warnings.length > 0) && (
                <div className="batch-issues">
                  <button type="button" className="text-button" onClick={() => setShowFailures((shown) => !shown)}>
                    {showFailures ? "Hide" : "Show"} details
                  </button>
                  {showFailures && (
                    <ul className="batch-issue-list">
                      {[...result.failures, ...result.comparisonFailures].map((failure) => (
                        <li key={failure.emailId}><strong>{failure.emailId}</strong> — {failure.message}</li>
                      ))}
                      {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}

          {error && <p className="form-error" role="alert"><Icon id="i-info" />{error}</p>}

          <p className="muted">
            Each email is classified and compared through the same pipeline a single case uses.
            Re-uploading the same bundle updates those cases rather than duplicating them.
          </p>
        </div>

        <footer className="new-case-footer">
          {result ? (
            <button type="button" className="primary-button" onClick={close}>Done</button>
          ) : (
            <>
              <button type="button" className="secondary-button" onClick={close} disabled={running}>Cancel</button>
              <button type="submit" className="primary-button" disabled={running || !file}>
                {running ? "Ingesting…" : "Start ingest"}
              </button>
            </>
          )}
        </footer>
      </form>
    </div>
  );
}
