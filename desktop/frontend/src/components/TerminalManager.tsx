import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "./Terminal";
import { api } from "../api";

type TerminalTab = {
  id: string;
  title: string;
};

function newTerminalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `term_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Multi-terminal manager.
 *
 * Lifecycle note: the set of currently-running child processes is tracked
 * in a `useRef` — *not* React state — and mutated imperatively from
 * `handleRunningChange`. It is deliberately **not** a `useEffect`
 * dependency. PROJECT_MEMORY.md §10.1 A-1 explains why: an earlier
 * version kept running-ids in state and listed it in the project-change
 * effect's dep array, which meant every time a child process flipped
 * `running → true` the parent effect re-fired, killed the freshly-
 * spawned child, and replaced the tabs mid-use. The ref carries the
 * same information without causing renders, so the effect's *only*
 * legitimate dependency is `projectDir`.
 */
export function TerminalManager({ projectDir }: { projectDir: string | null }) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [
    { id: newTerminalId(), title: "Terminal 1" },
  ]);
  const [activeId, setActiveId] = useState(() => tabs[0]!.id);
  const runningRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Snapshot so we don't race with handleRunningChange mutations while
    // the kill RPCs are still in flight.
    const toKill = Array.from(runningRef.current);
    runningRef.current.clear();

    void (async () => {
      for (const terminalId of toKill) {
        try {
          await api.terminalKill(terminalId);
        } catch {
          // Ignore — process may have already ended.
        }
      }
    })();

    // New project == new terminal sessions (avoid cross-project mixing).
    const id = newTerminalId();
    setTabs([{ id, title: "Terminal 1" }]);
    setActiveId(id);
  }, [projectDir]);

  useEffect(() => {
    // Keep activeId valid after resets.
    if (!tabs.some((t) => t.id === activeId)) {
      setActiveId(tabs[0]!.id);
    }
  }, [tabs, activeId]);

  const active = useMemo(
    () => tabs.find((t) => t.id === activeId) ?? tabs[0]!,
    [tabs, activeId],
  );

  const addTab = useCallback(() => {
    setTabs((prev) => {
      const nextIndex = prev.length + 1;
      const next = { id: newTerminalId(), title: `Terminal ${nextIndex}` };
      return [...prev, next];
    });
  }, []);

  const handleRunningChange = useCallback(
    (terminalId: string, running: boolean) => {
      if (running) {
        runningRef.current.add(terminalId);
      } else {
        runningRef.current.delete(terminalId);
      }
    },
    [],
  );

  const closeTab = useCallback(async (id: string) => {
    if (runningRef.current.has(id)) {
      runningRef.current.delete(id);
      try {
        await api.terminalKill(id);
      } catch {
        // Ignore kill errors - process may have already ended
      }
    }
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  return (
    <div className="terminal-manager">
      <div className="terminal-manager-tabs" role="tablist" aria-label="Terminal tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={
              "terminal-manager-tab" +
              (t.id === activeId ? " terminal-manager-tab-active" : "")
            }
            role="tab"
            aria-selected={t.id === activeId}
          >
            <button
              type="button"
              className="terminal-manager-tab-btn"
              onClick={() => setActiveId(t.id)}
              title={t.title}
            >
              {t.title}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                className="terminal-manager-tab-close"
                onClick={() => closeTab(t.id)}
                aria-label={`Close ${t.title}`}
                title="Close"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="terminal-manager-tab-add"
          onClick={addTab}
          aria-label="New terminal"
          title="New terminal"
        >
          +
        </button>
      </div>

      <div className="terminal-manager-body">
        <Terminal
          projectDir={projectDir}
          terminalId={active.id}
          onRunningChange={(running) => handleRunningChange(active.id, running)}
        />
      </div>
    </div>
  );
}
