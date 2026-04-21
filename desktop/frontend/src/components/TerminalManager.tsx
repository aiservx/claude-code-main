import { useCallback, useEffect, useMemo, useState } from "react";
import { Terminal } from "./Terminal";

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

export function TerminalManager({ projectDir }: { projectDir: string | null }) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [
    { id: newTerminalId(), title: "Terminal 1" },
  ]);
  const [activeId, setActiveId] = useState(() => tabs[0]!.id);

  useEffect(() => {
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

  const closeTab = useCallback((id: string) => {
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
        <Terminal projectDir={projectDir} terminalId={active.id} />
      </div>
    </div>
  );
}
