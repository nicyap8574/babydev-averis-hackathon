import { Icon } from "./IconSprite";
import type { View } from "../App";

const VIEW_CONTENT: Record<string, [string, string]> = {
  reports: [
    "Verification reports",
    "Browse and export completed discrepancy reports with the exact SI and BL values and reviewer history. Not implemented in this build — the backend only serves live comparison results, not saved report exports.",
  ],
  analytics: [
    "Quality analytics",
    "Track extraction agreement, escalation reasons, mismatch rates, and per-case cost across every field and document type. Not implemented in this build — there's no metrics store behind the API yet.",
  ],
  settings: [
    "Workspace settings",
    "Configure field aliases, comparison tolerance, model routing, and notification preferences. Not implemented in this build — the pipeline's field synonyms and tolerances are fixed in pipeline.py.",
  ],
};

interface PlaceholderViewProps {
  view: View;
  onOpenSample: () => void;
}

export function PlaceholderView({ view, onOpenSample }: PlaceholderViewProps) {
  const [title, copy] = VIEW_CONTENT[view] ?? ["Not available", "This section isn't implemented yet."];

  return (
    <section className="view active panel placeholder-view">
      <div className="placeholder-inner">
        <div className="placeholder-icon">
          <Icon id="i-file" />
        </div>
        <h2>{title}</h2>
        <p>{copy}</p>
        <button className="primary-button" onClick={onOpenSample}>
          <Icon id="i-eye" />
          <span>Open sample case</span>
        </button>
      </div>
    </section>
  );
}
