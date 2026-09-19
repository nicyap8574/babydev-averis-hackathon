import { useEffect, useRef, useState } from "react";
import { Icon } from "./IconSprite";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

function useOutsideClose(ref: React.RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ref, onClose]);
}

interface SelectProps<T extends string> {
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function Select<T extends string>({ options, value, onChange, ariaLabel }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useOutsideClose(rootRef, open, () => setOpen(false));

  const current = options.find((option) => option.value === value);

  return (
    <div className="dropdown-root" ref={rootRef}>
      <button
        type="button"
        className={`dropdown-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="dropdown-trigger-label">{current?.label ?? ""}</span>
        <span className="dropdown-chevron">
          <Icon id="i-chevron-down" />
        </span>
      </button>
      {open && (
        <div className="dropdown-panel" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`dropdown-item${option.value === value ? " selected" : ""}`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className="dropdown-item-label">{option.label}</span>
              {option.value === value && <Icon id="i-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface MultiSelectProps<T extends string> {
  options: SelectOption<T>[];
  values: T[];
  onChange: (values: T[]) => void;
  placeholder: string;
  ariaLabel?: string;
}

export function MultiSelect<T extends string>({ options, values, onChange, placeholder, ariaLabel }: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useOutsideClose(rootRef, open, () => setOpen(false));

  const toggle = (option: T) => {
    onChange(values.includes(option) ? values.filter((v) => v !== option) : [...values, option]);
  };

  const selectedLabels = options.filter((option) => values.includes(option.value)).map((option) => option.label);
  const triggerLabel =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels[0]} +${selectedLabels.length - 1}`;

  return (
    <div className="dropdown-root" ref={rootRef}>
      <button
        type="button"
        className={`dropdown-trigger${open ? " open" : ""}${values.length ? " has-value" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="dropdown-trigger-label">{triggerLabel}</span>
        {values.length > 0 && <span className="dropdown-count">{values.length}</span>}
        <span className="dropdown-chevron">
          <Icon id="i-chevron-down" />
        </span>
      </button>
      {open && (
        <div className="dropdown-panel" role="listbox">
          {options.map((option) => {
            const checked = values.includes(option.value);
            return (
              <button
                type="button"
                key={option.value}
                className={`dropdown-item${checked ? " selected" : ""}`}
                role="option"
                aria-selected={checked}
                onClick={() => toggle(option.value)}
              >
                <span className={`dropdown-checkbox${checked ? " checked" : ""}`}>
                  {checked && <Icon id="i-check" />}
                </span>
                <span className="dropdown-item-label">{option.label}</span>
              </button>
            );
          })}
          {values.length > 0 && (
            <button type="button" className="dropdown-clear" onClick={() => onChange([])}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
