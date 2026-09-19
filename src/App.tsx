import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  classifyInboxRecord,
  type InboxRecord,
} from "../supabase/functions/_shared/document-classifier";
import {
  identifyDocumentRequest,
  type DocumentRequestDecision,
  type InboxRecordInput,
} from "./features/inbox/api/identifyDocumentRequest";
import { supabase } from "./lib/supabase";

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

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

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

function App() {
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
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="LADING classifier home">
          <span className="brand-mark">
            <Icon size={21}>
              <path d="m4 7 8-4 8 4-8 4-8-4Z" />
              <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
              <path d="M12 11v10" />
            </Icon>
          </span>
          <span>
            <strong>LADING</strong>
            <small>Document intelligence</small>
          </span>
        </a>
        <div className="mode-pill" data-connected={Boolean(supabase)}>
          <span className="mode-dot" />
          {connectionMode}
        </div>
        <a className="prototype-link" href="/prototype.html">
          Open operations prototype
          <Icon size={15}><path d="M7 17 17 7M8 7h9v9" /></Icon>
        </a>
      </header>

      <main id="top">
        <section className="hero">
          <div className="eyebrow"><span>Classifier lab</span><i /></div>
          <div className="hero-grid">
            <div>
              <h1>Know what the email wants<br />before touching the documents.</h1>
              <p>
                Test the intent gate that decides which inbox records continue to extraction.
                Attachment presence never changes the category.
              </p>
            </div>
            <div className="hero-metric">
              <strong>98.3%</strong>
              <span>cheap-path coverage</span>
              <small>511 of 520 supplied emails decided without a model call</small>
            </div>
          </div>
        </section>

        {!supabase && (
          <aside className="connection-note">
            <Icon><path d="M12 3v10M8 9l4 4 4-4" /><path d="M5 17v3h14v-3" /></Icon>
            <div>
              <strong>Running locally without Supabase</strong>
              <span>Deterministic samples work now. Add Vite environment variables to enable persistence and the OpenRouter fallback.</span>
            </div>
          </aside>
        )}

        <section className="sample-section" aria-labelledby="sample-title">
          <div className="section-heading">
            <div><span>01</span><div><h2 id="sample-title">Choose a test case</h2><p>Start with the two acceptance edge cases.</p></div></div>
            <p>{samples[activeSample].detail}</p>
          </div>
          <div className="sample-tabs" role="tablist" aria-label="Classifier samples">
            {(Object.keys(samples) as SampleKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={activeSample === key ? "active" : ""}
                onClick={() => loadSample(key)}
                role="tab"
                aria-selected={activeSample === key}
              >
                <span>{samples[key].label}</span>
                {key === "a6" || key === "misleading" ? <em>Required</em> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="workspace">
          <form className="composer panel" onSubmit={runClassification}>
            <div className="panel-heading">
              <div>
                <span className="step-number">02</span>
                <div><h2>Inbox record</h2><p>Edit any field, then run the classifier.</p></div>
              </div>
              <span className="record-id">JSON input</span>
            </div>

            <div className="form-grid two-column">
              <label>
                <span>Email ID</span>
                <input value={form.emailId} onChange={(event) => update("emailId", event.target.value)} />
              </label>
              <label>
                <span>Sender</span>
                <input type="email" value={form.sender} onChange={(event) => update("sender", event.target.value)} />
              </label>
            </div>
            <label>
              <span>Subject</span>
              <input value={form.subject} onChange={(event) => update("subject", event.target.value)} />
            </label>
            <label>
              <span>Current message body</span>
              <textarea className="body-input" value={form.body} onChange={(event) => update("body", event.target.value)} />
            </label>
            <label>
              <span>Attachment filenames <small>comma separated</small></span>
              <input
                placeholder="Leave blank when no files were supplied"
                value={form.attachments}
                onChange={(event) => update("attachments", event.target.value)}
              />
            </label>
            <div className="attachment-row" aria-live="polite">
              {attachments.length ? attachments.map((attachment) => (
                <span className="attachment" key={attachment}>
                  <Icon size={14}><path d="M13 7 8.5 11.5a2.1 2.1 0 0 0 3 3L17 9a4 4 0 0 0-5.7-5.6L5 9.7a6 6 0 0 0 8.5 8.5L19 12.7" /></Icon>
                  {attachment}
                </span>
              )) : <span className="no-attachments">No attachments · intent classification still runs</span>}
            </div>
            <details className="metadata-editor">
              <summary>Metadata <span>Optional JSON</span></summary>
              <textarea value={form.metadata} onChange={(event) => update("metadata", event.target.value)} />
            </details>
            <div className="form-footer">
              <div className="privacy-note">
                <Icon size={16}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Icon>
                Classification uses the subject and current body, never attachment presence.
              </div>
              <button className="run-button" type="submit" disabled={running}>
                {running ? <span className="spinner" /> : <Icon><path d="m9 18 6-6-6-6" /></Icon>}
                {running ? "Classifying…" : "Run classifier"}
              </button>
            </div>
          </form>

          <section className="result panel" aria-live="polite">
            <div className="panel-heading">
              <div>
                <span className="step-number">03</span>
                <div><h2>Routing decision</h2><p>Category, gate result, and audit context.</p></div>
              </div>
              {decision && <span className="success-mark"><Icon size={15}><path d="m5 12 4 4L19 6" /></Icon>Complete</span>}
            </div>

            {!decision && !error && (
              <div className="empty-result">
                <div className="empty-icon">
                  <Icon size={29}><path d="M4 5h16v14H4z" /><path d="m4 7 8 6 8-6" /></Icon>
                </div>
                <h3>Waiting for an inbox record</h3>
                <p>Run a sample to see the classification and whether extraction should begin.</p>
                <div className="empty-flow"><span>Classify</span><i /><span>Route</span><i /><span>Extract</span></div>
              </div>
            )}

            {error && (
              <div className="error-result">
                <span><Icon size={22}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /></Icon></span>
                <div><h3>Could not classify this record</h3><p>{error}</p></div>
              </div>
            )}

            {decision && (
              <div className="decision-card">
                <div className="decision-label">Final category</div>
                <div className="decision-title">
                  <span className={`category-icon category-${decision.category}`}>
                    <Icon size={22}><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></Icon>
                  </span>
                  <div>
                    <h3>{categoryLabels[decision.category]}</h3>
                    <p>{decision.method === "deterministic" ? "Resolved on the free rule path" : `Resolved by ${decision.model}`}</p>
                  </div>
                </div>

                <div className={`route-verdict ${decision.continue_to_extraction ? "continue" : "stop"}`}>
                  <div>
                    <span>{decision.continue_to_extraction ? "Continue" : "Stop"}</span>
                    <strong>{decision.continue_to_extraction ? "Send to extraction" : "Classification complete"}</strong>
                  </div>
                  <span className="boolean-value">continue_to_extraction: {String(decision.continue_to_extraction)}</span>
                </div>

                <div className="pipeline-route">
                  <div className="route-node done"><Icon size={15}><path d="m5 12 4 4L19 6" /></Icon><span>Classify</span></div>
                  <i className={decision.continue_to_extraction ? "active" : ""} />
                  <div className={`route-node ${decision.continue_to_extraction ? "next" : "disabled"}`}><Icon size={15}><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /></Icon><span>Extract</span></div>
                </div>

                <div className="audit-grid">
                  <div><span>Decision path</span><strong>{decision.method}</strong></div>
                  <div><span>Cache</span><strong>{decision.cache_hit ? "reused" : "fresh"}</strong></div>
                  <div className="hash-cell"><span>Intent hash</span><strong title={decision.input_hash}>{decision.input_hash.slice(0, 12)}…</strong></div>
                </div>

                <div className="reason-block">
                  <span>Why this decision</span>
                  <ul>{decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </div>

                {decision.raw_model_output !== null && (
                  <details className="raw-output">
                    <summary>Raw model output <span>Audit record</span></summary>
                    <pre>{JSON.stringify(decision.raw_model_output, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}
          </section>
        </section>
      </main>

      <footer>
        <span>LADING classifier · {new Date().getFullYear()}</span>
        <span>React · Supabase · OpenRouter</span>
      </footer>
    </div>
  );
}

export default App;
