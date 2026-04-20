import type { ToolCall, ToolResult } from "../types";

type Props = {
  content: string;
  /** True while the final answer is still being streamed in. */
  streaming?: boolean;
  /** Provider actually routed for this final answer (Phase 2). */
  provider?: "openrouter" | "ollama";
  /** Concrete model id used on the wire. */
  model?: string;
  /** Tool calls surfaced alongside the answer (for the summary row). */
  toolCalls?: ToolCall[];
  /** Tool results (ok/err count is derived from these). */
  toolResults?: ToolResult[];
};

/**
 * Tier-1 "final answer" bubble — the most prominent chat element.
 *
 * This is what the user actually came for: the executor's last text
 * response after the plan / act / review loop has settled. Styling is
 * deliberately larger and bolder than the surrounding
 * {@link ThinkingBlock}s so the user can always tell at a glance
 * where the answer starts.
 *
 * Tool metadata is rendered as a compact summary row rather than a
 * full list — a user who wants detail clicks into the thinking blocks
 * above, or opens the execution panel. The bubble's job is to show
 * the answer itself, not re-list every action.
 */
export function FinalAnswerBubble({
  content,
  streaming,
  provider,
  model,
  toolCalls,
  toolResults,
}: Props) {
  const toolCount = toolCalls?.length ?? 0;
  const failed = toolResults?.filter((r) => !r.ok).length ?? 0;
  const toolSummary =
    toolCount > 0
      ? failed > 0
        ? `${toolCount} action${toolCount === 1 ? "" : "s"} · ${failed} failed`
        : `${toolCount} action${toolCount === 1 ? "" : "s"} taken`
      : null;

  return (
    <div className={`final-answer${streaming ? " is-streaming" : ""}`}>
      <div className="fa-header">
        <span className="fa-label">Answer</span>
        {provider && <span className={`fa-provider provider-${provider}`}>{provider}</span>}
        {model && (
          <span className="fa-model" title={model}>
            {model}
          </span>
        )}
        {streaming && <span className="streaming-dot" aria-label="streaming" />}
      </div>
      <div className="fa-content">{content || (streaming ? "…" : "")}</div>
      {toolSummary && <div className="fa-tools">{toolSummary}</div>}
    </div>
  );
}
