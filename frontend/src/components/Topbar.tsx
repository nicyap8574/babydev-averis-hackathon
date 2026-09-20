import { Icon } from "./IconSprite";

interface TopbarProps {
  eyebrow: string;
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchEnabled: boolean;
  onMenuClick: () => void;
  onNewCase: () => void;
}

export function Topbar({ eyebrow, title, search, onSearchChange, searchEnabled, onMenuClick, onNewCase }: TopbarProps) {
  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="icon-button mobile-menu" aria-label="Open menu" onClick={onMenuClick}>
          <Icon id="i-menu" />
        </button>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
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
          />
        </label>
        <button className="icon-button" aria-label="Notifications" disabled title="Not available in this build">
          <Icon id="i-bell" />
          <span className="notification-dot" />
        </button>
        <button className="primary-button" onClick={onNewCase}>
          <Icon id="i-plus" />
          <span>New case</span>
        </button>
      </div>
    </header>
  );
}
