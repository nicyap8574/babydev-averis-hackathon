import { Icon } from "./IconSprite";

interface TopbarProps {
  title: string;
  subtitle: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchEnabled: boolean;
  onMenuClick: () => void;
  onNewCase: () => void;
}

export function Topbar({
  title,
  subtitle,
  search,
  onSearchChange,
  searchEnabled,
  onMenuClick,
  onNewCase,
}: TopbarProps) {
  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <button className="icon-button mobile-menu" aria-label="Open menu" onClick={onMenuClick}>
          <Icon id="i-menu" />
        </button>
        <div style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          <p className="topbar-sub">{subtitle}</p>
        </div>
      </div>
      <div className="top-actions">
        <label className="search">
          <Icon id="i-search" />
          <input
            type="search"
            placeholder="Search cases or senders…"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            disabled={!searchEnabled}
            aria-label="Search cases or senders"
          />
        </label>
        <button className="icon-button" aria-label="Notifications" disabled title="Not available in this build">
          <Icon id="i-bell" />
          <span className="notification-dot" />
        </button>
        <button
          className="primary-button"
          onClick={onNewCase}
          title="Create a new case"
        >
          <Icon id="i-plus" />
          <span>Test a case</span>
        </button>
      </div>
    </header>
  );
}
