import { useEffect, useState } from "react";
import { createAttachmentSignedUrl, downloadAttachment, type CaseAttachment } from "../api";
import { Icon } from "./IconSprite";

type PreviewKind = "pdf" | "text" | "download";

function previewKind(attachment: CaseAttachment): PreviewKind {
  const extension = attachment.name.split(".").pop()?.toLowerCase();
  if (attachment.content_type === "application/pdf" || extension === "pdf") return "pdf";
  if (attachment.content_type?.startsWith("text/") || extension === "txt" || extension === "csv") return "text";
  return "download";
}

function fileSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentPreviewModalProps {
  attachment: CaseAttachment;
  attachments: CaseAttachment[];
  onClose: () => void;
  onSelect: (attachment: CaseAttachment) => void;
}

export function AttachmentPreviewModal({ attachment, attachments, onClose, onSelect }: AttachmentPreviewModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const index = attachments.findIndex((item) => item.path === attachment.path);
  const kind = previewKind(attachment);

  useEffect(() => {
    let cancelled = false;
    createAttachmentSignedUrl(attachment)
      .then(async (url) => {
        if (cancelled) return;
        setSignedUrl(url);
        if (kind === "text") {
          const response = await fetch(url);
          if (!response.ok) throw new Error("Could not read this attachment.");
          const content = await response.text();
          if (!cancelled) setText(content);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not open this attachment.");
      });
    return () => { cancelled = true; };
  }, [attachment, kind]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose]);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const blob = await downloadAttachment(attachment);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not download this attachment.");
    } finally {
      setDownloading(false);
    }
  };

  const previous = index > 0 ? attachments[index - 1] : null;
  const next = index >= 0 && index < attachments.length - 1 ? attachments[index + 1] : null;
  const size = fileSize(attachment.size_bytes);

  return (
    <div className="modal-backdrop open attachment-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${attachment.name}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="attachment-preview-modal">
        <header className="attachment-preview-header">
          <div>
            <h2>{attachment.name}</h2>
            <p>{[attachment.content_type, size].filter(Boolean).join(" · ") || "Attachment"}</p>
          </div>
          <button className="back-button" onClick={onClose} aria-label="Close attachment preview">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="attachment-preview-content">
          {error && <p className="form-error" role="alert">{error}</p>}
          {!error && !signedUrl && <p className="attachment-preview-status">Loading attachment…</p>}
          {!error && kind === "pdf" && signedUrl && <iframe className="attachment-pdf" src={signedUrl} title={attachment.name} />}
          {!error && kind === "text" && text !== null && <pre className="attachment-text">{text}</pre>}
          {!error && kind === "text" && signedUrl && text === null && <p className="attachment-preview-status">Loading text…</p>}
          {!error && kind === "download" && signedUrl && (
            <div className="attachment-download-fallback">
              <Icon id="i-file" />
              <strong>Preview is unavailable for this file type</strong>
              <span>Download the original file to view it in a compatible application.</span>
            </div>
          )}
        </div>

        <footer className="attachment-preview-footer">
          <div className="attachment-navigation">
            <button className="secondary-button" disabled={!previous} onClick={() => previous && onSelect(previous)}>Previous</button>
            <span>{index + 1} of {attachments.length}</span>
            <button className="secondary-button" disabled={!next} onClick={() => next && onSelect(next)}>Next</button>
          </div>
          <button className="primary-button" disabled={downloading} onClick={handleDownload}>
            <Icon id="i-file" />
            {downloading ? "Downloading…" : "Download"}
          </button>
        </footer>
      </section>
    </div>
  );
}
