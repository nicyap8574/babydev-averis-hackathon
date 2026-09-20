import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./IconSprite";
import type { View } from "../App";

interface GuideViewProps {
  onNavigate: (view: View) => void;
}

/* -- the miniature "screenshots" ------------------------------------------ */

const MOCK_NAV = ["Overview", "Inbox", "Review queue", "Reports", "Analytics"];

/** A stylised DocWise window. `active` is the index of the lit nav row, -1 for none. */
function MockFrame({ active, children }: { active: number; children: ReactNode }) {
  return (
    <div className="guide-mock">
      <div className="guide-mock-chrome">
        <i />
        <i />
        <i />
        <span>DocWise — shipping document verification</span>
      </div>
      <div className="guide-mock-body">
        <div className="guide-mock-side">
          <div className="guide-mock-brand">
            <span />
            <b />
          </div>
          {MOCK_NAV.map((label, index) => (
            <div key={label} className={`guide-mock-nav${index === active ? " on" : ""}`}>
              <span />
              <b>{label}</b>
            </div>
          ))}
        </div>
        <div className="guide-mock-main">{children}</div>
      </div>
    </div>
  );
}

function MockHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="guide-mock-head">
      <div className="guide-mock-head-copy">
        <strong>{title}</strong>
        <em>{sub}</em>
      </div>
      <div className="guide-mock-search" />
    </div>
  );
}

function MockMetrics() {
  const cards: [string, string, string][] = [
    ["Emails", "520", "blue"],
    ["Comparisons", "180", "purple"],
    ["Mismatches", "42", "red"],
    ["Needs review", "17", "amber"],
  ];
  return (
    <div className="guide-mock-metrics">
      {cards.map(([label, value, tone]) => (
        <div key={label} className="guide-mock-metric" data-tone={tone}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

const MOCK_ROWS: [string, string, string][] = [
  ["email_104", "BL comparison", "red"],
  ["email_211", "SI request", "blue"],
  ["email_318", "BL comparison", "green"],
  ["email_402", "Invoice query", "blue"],
  ["email_519", "BL comparison", "amber"],
];

function MockTable({
  rows = MOCK_ROWS,
  highlight = -1,
}: {
  rows?: [string, string, string][];
  highlight?: number;
}) {
  return (
    <div className="guide-mock-table">
      {rows.map(([id, category, tone], index) => (
        <div key={id} className={`guide-mock-row${index === highlight ? " on" : ""}`}>
          <b>{id}</b>
          <span>{category}</span>
          <em data-tone={tone} />
        </div>
      ))}
    </div>
  );
}

function MockCompare() {
  const fields: [string, string, string, boolean][] = [
    ["Shipper", "ACME LOGISTICS", "ACME LOGISTICS", true],
    ["Consignee", "NORD TRADING AS", "NORD TRADE AS", false],
    ["Port of loading", "SINGAPORE", "SINGAPORE", true],
    ["Gross weight", "22,000 KG", "22,000 KG", true],
  ];
  return (
    <div className="guide-mock-compare">
      <div className="guide-mock-compare-head">
        <span>Field</span>
        <span>Shipping instruction</span>
        <span>Bill of lading</span>
        <span />
      </div>
      {fields.map(([label, si, bl, ok]) => (
        <div key={label} className={`guide-mock-compare-row${ok ? "" : " bad"}`}>
          <b>{label}</b>
          <span>{si}</span>
          <span>{bl}</span>
          <em>{ok ? "match" : "mismatch"}</em>
        </div>
      ))}
    </div>
  );
}

function MockChart() {
  const bars = [82, 54, 96, 38, 67, 74, 45, 88, 61, 79];
  return (
    <div className="guide-mock-chart">
      {bars.map((height, index) => (
        <i key={index} style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}

/* -- the steps ------------------------------------------------------------- */

interface Step {
  key: string;
  label: string;
  title: string;
  tagline: string;
  body: string;
  bullets: string[];
  target?: View;
  targetLabel?: string;
  shot: ReactNode;
}

const STEPS: Step[] = [
  {
    key: "welcome",
    label: "Welcome",
    title: "Welcome to DocWise",
    tagline: "Orientation",
    body:
      "DocWise reads the shared shipping mailbox, sorts every email by intent, and checks each draft Bill of Lading against its Shipping Instruction. The model only reads — every value it reports traces back to an exact substring in the source document, and the match/mismatch decision itself is deterministic code.",
    bullets: [
      "Nothing is flagged that cannot be pointed at in the document",
      "Whatever the pipeline cannot decide is escalated to you, not guessed",
      "This guide follows the order you will actually work in",
    ],
    shot: (
      <MockFrame active={-1}>
        <MockHead title="Good morning, BabyDevs" sub="Friday, 20 September" />
        <MockMetrics />
        <MockTable />
      </MockFrame>
    ),
  },
  {
    key: "dashboard",
    label: "Start on Overview",
    title: "Start your day on Overview",
    tagline: "Overview",
    body:
      "The dashboard is the morning glance: how much came in, how many comparisons ran, how many mismatches were found, and how many cases are waiting on a human. The recent-case table underneath puts the cases that need attention in front of you first.",
    bullets: [
      "Four metric cards summarise the whole run",
      "The insights rail breaks down categories and top senders",
      "Search and the category filter narrow the table without leaving the page",
    ],
    target: "dashboard",
    targetLabel: "Open Overview",
    shot: (
      <MockFrame active={0}>
        <MockHead title="Good morning, BabyDevs" sub="Friday, 20 September" />
        <MockMetrics />
        <MockTable />
      </MockFrame>
    ),
  },
  {
    key: "inbox",
    label: "Scan the inbox",
    title: "Scan every classified email",
    tagline: "Inbox",
    body:
      "Inbox is the full, paginated list of everything the pipeline classified — comparison requests, SI requests, invoice queries, general traffic and spam. Each row carries its category and its verification status, so you can see at a glance which comparisons came back clean.",
    bullets: [
      "Filter by category, or search by case id or sender",
      "Status pills: OK, mismatch, or needs review",
      "Click any row to open the full case",
    ],
    target: "inbox",
    targetLabel: "Open Inbox",
    shot: (
      <MockFrame active={1}>
        <MockHead title="Inbox" sub="Every classified email in the shared mailbox" />
        <div className="guide-mock-filters">
          <span className="on">All</span>
          <span>BL comparison</span>
          <span>SI request</span>
          <span>Invoice</span>
          <span>Spam</span>
        </div>
        <MockTable rows={[...MOCK_ROWS, ["email_524", "General", "blue"]]} />
      </MockFrame>
    ),
  },
  {
    key: "case",
    label: "Open a case",
    title: "Read the comparison field by field",
    tagline: "Case detail",
    body:
      "Opening a case shows the seven compared fields side by side — shipper, consignee, notify party, both ports, container count and gross weight — with the Shipping Instruction value next to the Bill of Lading value. Mismatched rows are called out, and labels are matched by meaning, so “Port of Loading” and “Load Port” line up.",
    bullets: [
      "Both source values are shown, never just a verdict",
      "A blank or placeholder value (TBA, ???) is a review item, not a mismatch",
      "The attachments that produced the values are listed with the case",
    ],
    target: "inbox",
    targetLabel: "Go pick a case",
    shot: (
      <MockFrame active={1}>
        <MockHead title="email_104 · BL comparison" sub="Draft BL checked against the SI" />
        <MockCompare />
      </MockFrame>
    ),
  },
  {
    key: "review",
    label: "Clear the queue",
    title: "Clear what the pipeline escalated",
    tagline: "Review queue",
    body:
      "When the pipeline cannot decide — an attachment is missing, the document is the wrong type, the text is unreadable, or a field is blank — it refuses to guess and sends the case here instead. Each item states its reason, and you record the resolution against it.",
    bullets: [
      "Reasons: missing attachment, wrong doc type, unreadable, missing value",
      "Resolving an item drops it out of the pending count everywhere",
      "Escalation is the designed behaviour, not a failure",
    ],
    target: "review",
    targetLabel: "Open Review queue",
    shot: (
      <MockFrame active={2}>
        <MockHead title="Review queue" sub="Cases the pipeline could not decide" />
        <MockTable
          rows={[
            ["email_512", "Unreadable attachment", "amber"],
            ["email_517", "Missing value — gross weight", "amber"],
            ["email_519", "Missing value — shipper", "amber"],
            ["email_203", "Wrong document type", "amber"],
          ]}
          highlight={0}
        />
      </MockFrame>
    ),
  },
  {
    key: "analytics",
    label: "Check the trend",
    title: "See how the whole run behaved",
    tagline: "Analytics",
    body:
      "Analytics zooms out from single cases to the whole run: how classifications split across categories, which fields defect most often, and how much of the mailbox ended up needing a person. Useful for spotting a counterparty who keeps getting the same field wrong.",
    bullets: [
      "Category distribution across every email",
      "Defect counts per compared field",
      "Escalation rate for the run",
    ],
    target: "analytics",
    targetLabel: "Open Analytics",
    shot: (
      <MockFrame active={4}>
        <MockHead title="Analytics" sub="Classification and defect distribution" />
        <MockChart />
        <MockTable
          rows={[
            ["consignee", "18 defects", "red"],
            ["gross_weight_kg", "11 defects", "red"],
            ["notify_party", "7 defects", "amber"],
          ]}
        />
      </MockFrame>
    ),
  },
  {
    key: "lab",
    label: "Test an email",
    title: "Try the classifier on your own email",
    tagline: "Classifier lab",
    body:
      "The Classifier lab runs a single email through the intent classifier on demand. Paste a subject, body and attachment names, and it returns the category with the reasoning behind it — deterministic rules first, and a model only for the genuinely ambiguous cases.",
    bullets: [
      "Start from a sample email or paste your own",
      "Shows which rule or model produced the answer",
      "The “Test a case” button in the top bar lands here too",
    ],
    target: "classifier-lab",
    targetLabel: "Open Classifier lab",
    shot: (
      <MockFrame active={-1}>
        <MockHead title="Classifier lab" sub="Test the classifier one message at a time" />
        <div className="guide-mock-lab">
          <div className="guide-mock-form">
            <i />
            <i />
            <i className="tall" />
            <span />
          </div>
          <div className="guide-mock-verdict">
            <b>BL_COMPARISON</b>
            <em>matched: _si / _bl attachment pair</em>
            <i />
            <i />
          </div>
        </div>
      </MockFrame>
    ),
  },
  {
    key: "settings",
    label: "Make it yours",
    title: "Set it up the way you work",
    tagline: "Settings",
    body:
      "Settings holds the appearance choice — light for the desk, dark for a long review session — stored in this browser only. Field aliases, comparison tolerance and model routing live in the pipeline itself in this build. That is the whole tour; this guide stays in the sidebar whenever you want it again.",
    bullets: [
      "Light and dark theme, remembered per browser",
      "Reopen this guide any time from Help & guide in the sidebar",
      "Anything the pipeline cannot answer always comes to you",
    ],
    target: "settings",
    targetLabel: "Open Settings",
    shot: (
      <MockFrame active={-1}>
        <MockHead title="Settings" sub="Appearance, comparison and routing" />
        <div className="guide-mock-themes">
          <div className="on">
            <span />
            <b>Light</b>
          </div>
          <div>
            <span />
            <b>Dark</b>
          </div>
        </div>
        <div className="guide-mock-note" />
      </MockFrame>
    ),
  },
];

/* -- the view -------------------------------------------------------------- */

export function GuideView({ onNavigate }: GuideViewProps) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"down" | "up">("down");
  const step = STEPS[index];

  const go = (next: number) => {
    if (next < 0 || next >= STEPS.length || next === index) return;
    setDirection(next > index ? "down" : "up");
    setIndex(next);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowDown" || event.key === "PageDown") go(index + 1);
      if (event.key === "ArrowUp" || event.key === "PageUp") go(index - 1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  return (
    <section className="view active guide-view">
      <div className="guide-layout">
        <aside className="guide-rail" aria-label="Guide steps">
          <div className="guide-rail-head">
            <span className="guide-rail-eyebrow">User guide</span>
            <strong>
              Step {index + 1} of {STEPS.length}
            </strong>
          </div>
          <ol className="guide-steps">
            {STEPS.map((item, i) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={`guide-step${i === index ? " active" : ""}${i < index ? " done" : ""}`}
                  onClick={() => go(i)}
                  aria-current={i === index ? "step" : undefined}
                >
                  <span className="guide-step-dot">
                    {i < index ? <Icon id="i-check" /> : <b>{i + 1}</b>}
                  </span>
                  <span className="guide-step-label">{item.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <div className="guide-stage panel">
          <div className="guide-shot-frame">
            <div className="guide-shot" key={step.key} data-direction={direction}>
              {step.shot}
            </div>
            <div className="guide-arrows">
              <button
                type="button"
                className="guide-arrow"
                onClick={() => go(index - 1)}
                disabled={index === 0}
                aria-label="Previous step"
              >
                <Icon id="i-chevron-down" />
              </button>
              <button
                type="button"
                className="guide-arrow"
                onClick={() => go(index + 1)}
                disabled={index === STEPS.length - 1}
                aria-label="Next step"
              >
                <Icon id="i-chevron-down" />
              </button>
            </div>
          </div>

          <div className="guide-copy" key={`${step.key}-copy`}>
            <span className="guide-tagline">{step.tagline}</span>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
            <ul className="guide-bullets">
              {step.bullets.map((bullet) => (
                <li key={bullet}>
                  <Icon id="i-check" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="guide-controls">
            <div className="guide-progress" aria-hidden="true">
              {STEPS.map((item, i) => (
                <i key={item.key} className={i === index ? "on" : undefined} />
              ))}
            </div>
            <div className="guide-buttons">
              {step.target && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onNavigate(step.target as View)}
                >
                  {step.targetLabel}
                </button>
              )}
              {index < STEPS.length - 1 ? (
                <button type="button" className="primary-button" onClick={() => go(index + 1)}>
                  <span>Next</span>
                  <Icon id="i-arrow" />
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => onNavigate("dashboard")}
                >
                  <span>Start reviewing</span>
                  <Icon id="i-arrow" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
