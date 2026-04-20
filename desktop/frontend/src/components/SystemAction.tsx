import type { ReactNode } from "react";

/**
 * Tone classes map to small palette changes in `styles.css` — `info`
 * is the default neutral look, `success` / `warn` / `error` tint the
 * icon and border. Keep the set small: the whole point of a system
 * action is to be a glanceable micro-annotation, not a full status row.
 */
export type SystemActionTone = "info" | "success" | "warn" | "error";

type Props = {
  /** Short glyph (e.g. `→`, `✓`, `✗`, `⏵`). Optional. */
  icon?: ReactNode;
  /** One-line label. Should be short (≤ 80 chars) and reasonably self-
   *  describing — no need to say "status:" or "tool:", the tier / tone
   *  already communicates that. */
  text: ReactNode;
  /** Visual tone. Defaults to `info`. */
  tone?: SystemActionTone;
  /** Optional click handler (e.g. jump to the execution panel). */
  onClick?: () => void;
  title?: string;
};

/**
 * Tier-3 "system action" pill — the smallest, most inline of the three
 * chat bubble tiers. Used for tool calls / tool results / short
 * non-answer status messages. Renders either as an inline-flex pill or
 * as a button when `onClick` is provided; semantically the button form
 * is preferred for anything interactive so keyboard users can reach it.
 */
export function SystemAction({ icon, text, tone = "info", onClick, title }: Props) {
  const className = `system-action tone-${tone}`;
  const inner = (
    <>
      {icon != null && <span className="sa-icon">{icon}</span>}
      <span className="sa-text">{text}</span>
    </>
  );
  if (onClick) {
    return (
      <button className={className} onClick={onClick} title={title} type="button">
        {inner}
      </button>
    );
  }
  return (
    <div className={className} title={title}>
      {inner}
    </div>
  );
}
