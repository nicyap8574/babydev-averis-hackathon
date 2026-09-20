import { useMemo, useState, type FormEvent } from "react";
import {
  classifyInboxRecord,
  type InboxRecord,
} from "../lib/document-classifier";
import {
  identifyDocumentRequest,
  type DocumentRequestDecision,
  type InboxRecordInput,
} from "../features/inbox/api/identifyDocumentRequest";
import { supabase } from "../lib/supabase";
import { Icon } from "./IconSprite";

type SampleKey = "a6" | "misleading" | "invoice" | "spam" | "ambiguous";
type FormState = {
  emailId: string;
  sender: string;
  subject: string;
  body: string;
  attachments: string;
  metadata: string;
};

const samples: Record<SampleKey, { label: string; detail: string; form: FormState }> = {
  a6: {
    label: "A6 · no attachment",
    detail: "Comparison intent must survive an empty attachment list.",
    form: {
      emailId: "demo-a6-001",
      sender: "operations@oceanbridge.example",
      subject: "REQUEST BL DRAFT · Booking OB-882190",
      body: "Hi team,\n\nPlease assist to send the draft BL for booking OB-882190 for checking as soon as possible.\n\nThank you.",
      attachments: "",
      metadata: '{\n  "received_at": "2026-09-19T09:42:00+08:00",\n  "priority": "normal"\n}',
    },
  },
  misleading: {
    label: "R18 · misleading subject",
    detail: "The current message body must override an invoice-shaped subject.",
    form: {
      emailId: "demo-r18-001",
      sender: "docs@meridian.example",
      subject: "RE: Invoice 7781 follow-up",
      body: "Please ignore the old subject. Compare the attached shipping instruction with the draft bill of lading and confirm that they match.",
      attachments: "shipment-SI.pdf, shipment-draft-BL.pdf",
      metadata: '{\n  "received_at": "2026-09-19T09:45:00+08:00",\n  "priority": "high"\n}',
    },
  },
  invoice: {
    label: "Invoice query",
    detail: "A non-comparison message must stop after classification.",
    form: {
      emailId: "demo-invoice-001",
      sender: "finance@seabridge.example",
      subject: "Local charges · Invoice 5250075931",
      body: "Is the THC included or billed separately? Please advise the invoice breakdown.",
      attachments: "invoice-5250075931.pdf",
      metadata: '{\n  "received_at": "2026-09-19T10:02:00+08:00",\n  "priority": "normal"\n}',
    },
  },
  spam: {
    label: "Spam",
    detail: "Strong phishing signals should stay on the free deterministic path.",
    form: {
      emailId: "demo-spam-001",
      sender: "rewards@unknown.example",
      subject: "Congratulations · claim your gift card now",
      body: "You have won. Click http://bit.ly/claim-prize-now to claim your gift card.",
      attachments: "",
      metadata: '{\n  "received_at": "2026-09-19T10:10:00+08:00",\n  "priority": "low"\n}',
    },
  },
  ambiguous: {
    label: "Ambiguous · model path",
    detail: "With Supabase connected, this escalates to the pinned OpenRouter model.",
    form: {
      emailId: "demo-ambiguous-001",
      sender: "partner@example.com",
      subject: "Following up",
      body: "Could you take a look at this and let me know what you think?",
      attachments: "reference.pdf",
      metadata: '{\n  "received_at": "2026-09-19T10:15:00+08:00",\n  "priority": "normal"\n}',
    },
  },
};

const categoryLabels: Record<DocumentRequestDecision["category"], string> = {
  comparison_request: "Comparison request",
  new_si_request: "New SI request",
  invoice_query: "Invoice query",
  general_message: "General message",
  spam: "Spam",
};

function parseAttachments(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function buildRecord(form: FormState): InboxRecordInput {
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(form.metadata || "{}");
  } catch {
    throw new Error("Metadata must be valid JSON.");
  }
  if (!form.emailId.trim() || !form.subject.trim() || !form.body.trim()) {
    throw new Error("Email ID, subject, and body are required.");
  }
  return {
    email_id: form.emailId.trim(),
    from: form.sender.trim() || undefined,
    subject: form.subject.trim(),
    body: form.body.trim(),
    attachments: parseAttachments(form.attachments),
    metadata,
  };
}

export function ClassifierLabView() {
  const [activeSample, setActiveSample] = useState<SampleKey>("a6");
  const [form, setForm] = useState<FormState>(samples.a6.form);
  const [decision, setDecision] = useState<DocumentRequestDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const attachments = useMemo(() => parseAttachments(form.attachments), [form.attachments]);
  const connectionMode = supabase ? "Supabase connected" : "Local rules mode";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDecision(null);
    setError(null);
  }

  function loadSample(key: SampleKey) {
    setActiveSample(key);
    setForm(samples[key].form);
    setDecision(null);
    setError(null);
  }

  async function runClassification(event: FormEvent) {
    event.preventDefault();
    setRunning(true);
    setDecision(null);
    setError(null);

    try {
      const record = buildRecord(form);
      const result = supabase
        ? await identifyDocumentRequest(supabase, record)
        : await classifyInboxRecord(record as InboxRecord);
      setDecision(result);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Classification failed.";
      setError(
        !supabase && message.includes("OpenRouter")
          ? "This message is ambiguous. Connect Supabase to test the OpenRouter fallback."
          : message,
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="lab-grid">
      {!supabase && (
        <div className="explanation">
          <Icon id="i-info" />
          <span>
            <strong>Running locally without Supabase.</strong> Deterministic samples work now.
            Add <code>VITE_SUPABASE_URL</code>/<code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to{" "}
            <code>frontend/.env.local</code> to enable persistence and the OpenRouter fallback.
          </span>
        </div>
      )}

      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <h2>Choose a test case</h2>
            <p>{samples[activeSample].detail}</p>
          </div>
          <span className={`category-pill ${supabase ? "category-invoice_query" : "category-general"}`}>
            {connectionMode}
          </span>
        </div>
        <div className="doc-tabs lab-sample-tabs" role="tablist" aria-label="Classifier samples">
          {(Object.keys(samples) as SampleKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`doc-tab${activeSample === key ? " active" : ""}`}
              onClick={() => loadSample(key)}
              role="tab"
              aria-selected={activeSample === key}
            >
              {samples[key].label}
            </button>
          ))}
        </div>
      </section>

      <div className="lab-workspace">
        <form className="panel lab-form" onSubmit={runClassification}>
          <div className="panel-head">
            <div className="panel-title">
              <h2>Inbox record</h2>
              <p>Edit any field, then run the classifier.</p>
            </div>
          </div>
          <div className="lab-form-body">
            <div className="lab-field-grid">
              <label className="lab-field">
                <span>Email ID</span>
                <input value={form.emailId} onChange={(event) => update("emailId", event.target.value)} />
              </label>
              <label className="lab-field">
                <span>Sender</span>
                <input type="email" value={form.sender} onChange={(event) => update("sender", event.target.value)} />
              </label>
            </div>
            <label className="lab-field">
              <span>Subject</span>
              <input value={form.subject} onChange={(event) => update("subject", event.target.value)} />
            </label>
            <label className="lab-field">
              <span>Current message body</span>
              <textarea
                className="lab-body-input"
                value={form.body}
                onChange={(event) => update("body", event.target.value)}
              />
            </label>
            <label className="lab-field">
              <span>
                Attachment filenames <small>comma separated</small>
              </span>
              <input
                placeholder="Leave blank when no files were supplied"
                value={form.attachments}
                onChange={(event) => update("attachments", event.target.value)}
              />
            </label>
            <div className="lab-attachment-row" aria-live="polite">
              {attachments.length
                ? attachments.map((attachment) => (
                    <span className="lab-attachment" key={attachment}>
                      {attachment}
                    </span>
                  ))
                : <span className="lab-no-attachments">No attachments · intent classification still runs</span>}
            </div>
            <details className="lab-metadata-editor">
              <summary>
                Metadata <span>Optional JSON</span>
              </summary>
              <textarea value={form.metadata} onChange={(event) => update("metadata", event.target.value)} />
            </details>
            <div className="lab-form-footer">
              <span className="lab-privacy-note">
                Classification uses the subject and current body, never attachment presence.
              </span>
              <button className="primary-button" type="submit" disabled={running}>
                {running ? "Classifying…" : "Run classifier"}
              </button>
            </div>
          </div>
        </form>

        <section className="panel lab-result" aria-live="polite">
          <div className="panel-head">
            <div className="panel-title">
              <h2>Routing decision</h2>
              <p>Category, gate result, and audit context.</p>
            </div>
          </div>

          <div className="lab-result-body">
            {!decision && !error && (
              <div className="unavailable-panel">
                <div className="metric-icon">
                  <Icon id="i-inbox" />
                </div>
                <strong>Waiting for an inbox record</strong>
                <span>Run a sample to see the classification and whether extraction should begin.</span>
              </div>
            )}

            {error && (
              <div className="unavailable-panel">
                <div className="metric-icon">
                  <Icon id="i-alert" />
                </div>
                <strong>Could not classify this record</strong>
                <span>{error}</span>
              </div>
            )}

            {decision && (
              <>
                <div className={`verdict lab-verdict ${decision.continue_to_extraction ? "clear" : "muted"}`}>
                  <span>Final category</span>
                  <strong>{categoryLabels[decision.category]}</strong>
                  <p className="lab-verdict-note">
                    {decision.method === "deterministic"
                      ? "Resolved on the free rule path"
                      : `Resolved by ${decision.model}`}
                  </p>
                </div>

                <div className={`verdict lab-verdict ${decision.continue_to_extraction ? "clear" : "review"}`}>
                  <span>{decision.continue_to_extraction ? "Continue" : "Stop"}</span>
                  <strong>{decision.continue_to_extraction ? "Send to extraction" : "Classification complete"}</strong>
                  <p className="lab-verdict-note">continue_to_extraction: {String(decision.continue_to_extraction)}</p>
                </div>

                <div className="lab-audit-grid">
                  <div>
                    <span>Decision path</span>
                    <strong>{decision.method}</strong>
                  </div>
                  <div>
                    <span>Cache</span>
                    <strong>{decision.cache_hit ? "reused" : "fresh"}</strong>
                  </div>
                  <div>
                    <span>Intent hash</span>
                    <strong title={decision.input_hash}>{decision.input_hash.slice(0, 12)}…</strong>
                  </div>
                </div>

                <div className="explanation lab-reason-block">
                  <Icon id="i-check" />
                  <div>
                    <strong>Why this decision</strong>
                    <ul>
                      {decision.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {decision.raw_model_output !== null && (
                  <details className="lab-raw-output">
                    <summary>
                      Raw model output <span>Audit record</span>
                    </summary>
                    <pre>{JSON.stringify(decision.raw_model_output, null, 2)}</pre>
                  </details>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
