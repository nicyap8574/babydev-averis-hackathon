import { useState, type FormEvent } from "react";
import { Icon } from "./IconSprite";

interface NewCaseModalProps {
  open: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { subject: string; sender: string; body: string; files: File[] }) => Promise<void>;
}

export function NewCaseModal({ open, saving, error, onClose, onSubmit }: NewCaseModalProps) {
  const [subject, setSubject] = useState("");
  const [sender, setSender] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ subject: subject.trim(), sender: sender.trim(), body: body.trim(), files });
  }

  return (
    <div className="modal-backdrop open" role="dialog" aria-modal="true" aria-labelledby="new-case-title" onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="modal new-case-modal" onSubmit={submit}>
        <header className="modal-header">
          <div><h2 id="new-case-title">Create a case</h2><p>Add the email details and documents for the shared workspace.</p></div>
          <button type="button" className="icon-button" onClick={onClose} disabled={saving} aria-label="Close">×</button>
        </header>
        <div className="new-case-fields">
          <label>Subject<input required maxLength={240} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label>Sender<input type="email" required maxLength={320} value={sender} onChange={(e) => setSender(e.target.value)} placeholder="name@example.com" /></label>
          <label>Email message<textarea required rows={6} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
          <label>Attachments <span className="muted">(PDF, DOCX, XLSX or text; up to 20 MB each)</span>
            <input type="file" multiple accept=".pdf,.docx,.xlsx,.txt,.csv" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
          {files.length > 0 && <ul>{files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul>}
          {error && <p className="form-error" role="alert"><Icon id="i-info" />{error}</p>}
          <p className="muted">Uploaded documents are shared with everyone who can access this workspace.</p>
          <p className="muted">Email intent is classified after saving. Hosted SI/BL document comparison is not enabled yet, so comparison cases will remain marked as awaiting comparison.</p>
        </div>
        <footer className="new-case-footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Create case"}</button>
        </footer>
      </form>
    </div>
  );
}
