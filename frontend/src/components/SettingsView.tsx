import { Icon } from "./IconSprite";

type Theme = "light" | "dark";

interface SettingsViewProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

const THEMES: { value: Theme; icon: string; label: string; note: string }[] = [
  { value: "light", icon: "i-sun", label: "Light", note: "Default reviewer theme" },
  { value: "dark", icon: "i-moon", label: "Dark", note: "Easier on long review sessions" },
];

export function SettingsView({ theme, onThemeChange }: SettingsViewProps) {
  return (
    <section className="view active settings-stack">
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <h2>Appearance</h2>
            <p>Theme is stored in this browser only</p>
          </div>
        </div>
        <div className="theme-choice">
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`theme-option${theme === option.value ? " active" : ""}`}
              onClick={() => onThemeChange(option.value)}
              aria-pressed={theme === option.value}
            >
              <span className="theme-option-icon">
                <Icon id={option.icon} />
              </span>
              <span className="theme-option-copy">
                <strong>{option.label}</strong>
                <span>{option.note}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <h2>Comparison &amp; routing</h2>
            <p>Field aliases, tolerance, model cascade</p>
          </div>
        </div>
        <div className="settings-note">
          Configure field aliases, comparison tolerance, model routing, and notification
          preferences. Not implemented in this build — the pipeline's field synonyms and
          tolerances are fixed in pipeline.py.
        </div>
      </div>
    </section>
  );
}
