import { Icon } from "./IconSprite";
import type { View } from "../App";

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
  open: boolean;
  inboxCount: number;
  reviewCount: number;
}

const NAV_ITEMS: { view: View; icon: string; label: string; count?: "inbox" | "review" }[] = [
  { view: "dashboard", icon: "i-grid", label: "Overview" },
  { view: "inbox", icon: "i-inbox", label: "Inbox", count: "inbox" },
  { view: "review", icon: "i-review", label: "Review queue", count: "review" },
  { view: "reports", icon: "i-file", label: "Reports" },
  { view: "analytics", icon: "i-chart", label: "Analytics" },
];

export function Sidebar({ view, onNavigate, open, inboxCount, reviewCount }: SidebarProps) {
  const counts = { inbox: inboxCount, review: reviewCount };

  return (
    <aside className={`sidebar${open ? " open" : ""}`} id="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Icon id="i-box" />
        </div>
        <div className="brand-copy">
          <div className="brand-name">LADING</div>
          <div className="brand-sub">Document intelligence</div>
        </div>
      </div>

      <div className="nav-label">Workspace</div>
      <nav className="nav-list" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            className={`nav-item${view === item.view ? " active" : ""}`}
            onClick={() => onNavigate(item.view)}
          >
            <Icon id={item.icon} />
            <span>{item.label}</span>
            {item.count && <b className="nav-count">{counts[item.count]}</b>}
          </button>
        ))}
      </nav>

      <div className="nav-label">Manage</div>
      <nav className="nav-list" aria-label="Settings navigation">
        <button
          className={`nav-item${view === "settings" ? " active" : ""}`}
          onClick={() => onNavigate("settings")}
        >
          <Icon id="i-settings" />
          <span>Settings</span>
        </button>
      </nav>

      <div className="sidebar-spacer" />
      <div className="system-card">
        <div className="system-head">
          <strong>Backend connected</strong>
          <span className="live-dot" />
        </div>
        <div className="system-copy">
          FastAPI serving submission.json
          <br />
          Pipeline results, no live re-run
        </div>
      </div>
      <div className="user-card">
        <div className="avatar">MY</div>
        <div className="user-copy">
          <strong>Maya Yusof</strong>
          <span>Operations reviewer</span>
        </div>
      </div>
    </aside>
  );
}
