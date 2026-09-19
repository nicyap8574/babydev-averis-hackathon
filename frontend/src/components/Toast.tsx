import { Icon } from "./IconSprite";

export function Toast({ message }: { message: string | null }) {
  return (
    <div className={`toast${message ? " show" : ""}`}>
      <Icon id="i-check" />
      <span>{message ?? ""}</span>
    </div>
  );
}
