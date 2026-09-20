import { Icon } from "./IconSprite";
import type { View } from "../App";

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
  open: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
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

const TOOLS_NAV_ITEMS: { view: View; icon: string; label: string }[] = [
  { view: "classifier-lab", icon: "i-search", label: "Classifier lab" },
];

export function Sidebar({
  view,
  onNavigate,
  open,
  collapsed,
  onToggleCollapse,
  inboxCount,
  reviewCount,
}: SidebarProps) {
  const counts = { inbox: inboxCount, review: reviewCount };

  const renderItem = (item: { view: View; icon: string; label: string; count?: "inbox" | "review" }) => (
    <button
      key={item.view}
      className={`nav-item${view === item.view ? " active" : ""}`}
      onClick={() => onNavigate(item.view)}
      title={collapsed ? item.label : undefined}
      aria-current={view === item.view ? "page" : undefined}
    >
      <Icon id={item.icon} />
      <span>{item.label}</span>
      {item.count && <b className="nav-count">{counts[item.count]}</b>}
    </button>
  );

  return (
    <aside className={`sidebar${open ? " open" : ""}`} id="sidebar">
      <div className="sidebar-head">
        <button
          className="brand-home"
          type="button"
          onClick={() => onNavigate("dashboard")}
          title={collapsed ? "Home" : undefined}
          aria-label="Home"
        >
          <div className="brand-mark">
            <img src="/logo.png" alt="" width={34} height={34} />
          </div>
          <div className="brand-copy">
            <div className="brand-name">DocWise</div>
            <div className="brand-sub">Document intelligence</div>
          </div>
        </button>
        <button
          className="collapse-switch"
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon id="i-chevrons-left" />
        </button>
      </div>

      <div className="nav-label">Workspace</div>
      <nav className="nav-list" aria-label="Main navigation">
        {NAV_ITEMS.map(renderItem)}
      </nav>

      <div className="nav-label">Tools</div>
      <nav className="nav-list" aria-label="Tools navigation">
        {TOOLS_NAV_ITEMS.map(renderItem)}
      </nav>

      <div className="sidebar-spacer" />
      <div className="sidebar-divider" />

      <div className="nav-label">Account</div>
      <nav className="nav-list" aria-label="Account navigation">
        {renderItem({ view: "guide", icon: "i-help", label: "Help & guide" })}
        {renderItem({ view: "settings", icon: "i-settings", label: "Settings" })}
      </nav>

      <div className="sidebar-divider" />

      <div className="user-card">
        <div className="avatar">BD</div>
        <div className="user-copy">
          <strong>BabyDevs</strong>
          <span>Operations reviewer</span>
        </div>
      </div>
    </aside>
  );
}
