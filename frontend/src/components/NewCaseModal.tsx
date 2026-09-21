import { useState, type FormEvent } from "react";
import { Icon } from "./IconSprite";

/** Wording the deterministic classifier scores decisively as a comparison
 *  request, so attaching an SI/BL pair to it produces a verdict. */
const SAMPLE = {
  subject: "TO CONFIRM DOCS - draft BL check",
  sender: "ops@example.com",
  body: "Attached are the SI and draft BL. Please compare the SI against the draft BL and confirm the details match.",
};

interface NewCaseModalProps {
  saving: boolean;
  error: string | null;
  /** A correct-but-unexpected outcome, such as the classifier deciding the
   *  email is not a comparison request. Not styled as a failure. */
  notice: string | null;
  onClose: () => void;
  onSubmit: (input: { subject: string; sender: string; body: string; files: File[] }) => Promise<void>;
}

export function NewCaseModal({ saving, error, notice, onClose, onSubmit }: NewCaseModalProps) {
  const [subject, setSubject] = useState("");
  const [sender, setSender] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);


  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ subject: subject.trim(), sender: sender.trim(), body: body.trim(), files });
  }

  /** Successive picks add to the selection instead of replacing it; the file
   *  input only ever reports the files chosen in that one dialog. */
  function addFiles(picked: File[]) {
    setFiles((current) => {
      const merged = [...current];
      for (const file of picked) {
        if (!merged.some((existing) => existing.name === file.name && existing.size === file.size)) {
          merged.push(file);
        }
      }
      return merged;
    });
  }

  return (
    <div className="modal-backdrop open" role="dialog" aria-modal="true" aria-labelledby="new-case-title" onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="modal new-case-modal" onSubmit={submit}>
        <header className="modal-header">
          <div><h2 id="new-case-title">Create a case</h2><p>Add the email details and documents for the shared workspace.</p></div>
          <button type="button" className="icon-button" onClick={onClose} disabled={saving} aria-label="Close">×</button>
        </header>
        <div className="new-case-fields">
          <button
            type="button"
            className="text-button sample-link"
            disabled={saving}
            onClick={() => {
              setSubject(SAMPLE.subject);
              setSender(SAMPLE.sender);
              setBody(SAMPLE.body);
            }}
          >
            Use a sample comparison email
          </button>
          <label>Subject<input required maxLength={240} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label>Sender<input type="email" required maxLength={320} value={sender} onChange={(e) => setSender(e.target.value)} placeholder="name@example.com" /></label>
          <label>Email message<textarea required rows={6} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
          <div className="attachment-field">
            <span className="field-label">Attachments <span className="muted">(PDF, DOCX, XLSX or text; up to 20 MB each)</span></span>
            <label className="file-picker">
              <input
                className="file-picker-input"
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.txt,.csv"
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  // Clearing lets the same file be re-picked after removal.
                  event.target.value = "";
                }}
              />
              <span className="file-picker-button"><Icon id="i-upload" />Attach files</span>
              <span className="file-picker-status">{files.length === 0 ? "No files selected" : `${files.length} file${files.length === 1 ? "" : "s"} selected`}</span>
            </label>
          </div>
          {files.length > 0 && (
            <ul className="picked-files">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}`}>
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="text-button"
                    disabled={saving}
                    onClick={() => setFiles((current) => current.filter((candidate) => candidate !== file))}
                    aria-label={`Remove ${file.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="form-error" role="alert"><Icon id="i-info" />{error}</p>}
          {notice && <p className="form-notice" role="status"><Icon id="i-info" />{notice}</p>}
          <p className="muted">Uploaded documents are shared with everyone who can access this workspace.</p>
          <p className="muted">
            Intent is classified from the subject and message text, not from the attached files.
            SI/BL comparison runs automatically for emails that read as comparison requests.
          </p>
        </div>
        <footer className="new-case-footer">
          {notice ? (
            // The case already exists; offering "Create case" again would only
            // produce a duplicate.
            <button type="button" className="primary-button" onClick={onClose}>Done</button>
          ) : (
            <>
              <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Create case"}</button>
            </>
          )}
        </footer>
      </form>
    </div>
  );
}
