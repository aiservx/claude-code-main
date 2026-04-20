import { useEffect, useState, type ReactNode } from "react";
import type { AgentRole, ToolCall, ToolResult } from "../types";
import { SystemAction } from "./SystemAction";

type Props = {
  role: AgentRole;
  /** Text content produced by the agent so far. */
  content: string;
  /** True while tokens are still streaming into `content`. */
  streaming: boolean;
  /** Provider actually routed for this agent (Phase 2 dispatcher). */
  provider?: "openrouter" | "ollama";
  /** Concrete model identifier used on the wire. */
  model?: string;
  /** Elapsed run time for this agent, in ms. Shown when ≥ 200ms. */
  durationMs?: number;
  /** Tool calls issued by the agent during this step. */
  toolCalls?: ToolCall[];
  /** Tool results returned to the agent during this step. */
  toolResults?: ToolResult[];
  /** Default open state once streaming has ended. Defaults to false. */
  defaultExpanded?: boolean;
  /** Override the default "Planner" / "Executor" / "Reviewer" label. */
  label?: ReactNode;
};

const ROLE_LABEL: Record<AgentRole, string> = {
  planner: "Planner",
  executor: "Executor",
  reviewer: "Reviewer",
};

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1_000);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function formatArgsPreview(args: unknown): string {
  try {
    if (args == null) return "";
    if (typeof args === "string") {
      return args.length > 60 ? args.slice(0, 60) + "…" : args;
    }
    const json = JSON.stringify(args);
    return json.length > 60 ? json.slice(0, 60) + "…" : json;
  } catch {
    return "";
  }
}

/**
 * Tier-2 "thinking block" — collapsible reasoning bubble for planner,
 * executor-iteration, and reviewer output.
 *
 * Rendering rules:
 * - While `streaming` is true, the body auto-expands and shows a live
 *   cursor. The user can click the header to collapse at any time but
 *   a fresh streaming restart will re-open the body (by design — we
 *   don't want users to lose sight of live thinking they just
 *   collapsed).
 * - Once streaming ends, the block is collapsed by default. The
 *   header still conveys *what* happened via a tool-count badge.
 * - Provider / model badges come from the Phase 2 `ai:step` events
 *   so the user can tell at a glance which backend actually produced
 *   this step (cloud vs local).
 */
export function ThinkingBlock({
  role,
  content,
  streaming,
  provider,
  model,
  durationMs,
  toolCalls,
  toolResults,
  defaultExpanded,
  label,
}: Props) {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded ?? streaming);

  // Re-open the body whenever streaming resumes: a reviewer retry or a
  // late token frame shouldn't hide progress behind a collapsed header.
  useEffect(() => {
    if (streaming) setExpanded(true);
  }, [streaming]);

  const toolCount = toolCalls?.length ?? 0;
  const durationLabel =
    durationMs != null && durationMs >= 200 ? formatDuration(durationMs) : undefined;

  const resultByCallId = new Map<string, ToolResult>();
  for (const r of toolResults ?? []) resultByCallId.set(r.id, r);

  return (
    <div className={`thinking-block role-${role}${streaming ? " is-streaming" : ""}`}>
      <button
        className="tb-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        type="button"
      >
        <span className="tb-caret" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
        <span className={`role-chip chip-${role}`}>{label ?? ROLE_LABEL[role]}</span>
        {streaming && <span className="streaming-dot" aria-label="thinking" />}
        {!streaming && toolCount > 0 && (
          <span className="tb-tool-count">
            {toolCount} action{toolCount === 1 ? "" : "s"}
          </span>
        )}
        <span className="tb-spacer" />
        {provider && <span className={`tb-provider provider-${provider}`}>{provider}</span>}
        {model && (
          <span className="tb-model" title={model}>
            {model}
          </span>
        )}
        {durationLabel && <span className="tb-duration">{durationLabel}</span>}
      </button>
      {expanded && (
        <div className="tb-body">
          {content ? (
            <div className="tb-content">{content}</div>
          ) : streaming ? (
            <div className="tb-placeholder">…</div>
          ) : null}
          {toolCount > 0 && (
            <div className="tb-tools">
              {toolCalls!.map((tc) => {
                const result = resultByCallId.get(tc.id);
                const tone = result
                  ? result.ok
                    ? "success"
                    : "error"
                  : streaming
                    ? "info"
                    : "warn";
                const icon = result ? (result.ok ? "✓" : "✗") : "→";
                const preview = formatArgsPreview(tc.args);
                return (
                  <SystemAction
                    key={tc.id}
                    icon={icon}
                    tone={tone}
                    text={
                      <>
                        <strong>{tc.name}</strong>
                        {preview && <span className="sa-args"> {preview}</span>}
                      </>
                    }
                    title={preview || tc.name}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
