/**
 * Global application store backed by Zustand (audit §7.6, plan §5.6).
 *
 * Before this module, `App.tsx` owned every piece of cross-cutting
 * state (projectDir, health probes, chat messages, event ring buffer,
 * sidebar toggles) via `useState` chains and then prop-drilled them
 * into leaf components. Any new feature that needed access —
 * e.g. a task-panel component that wanted to append an error entry to
 * the Debug log — had to plumb another prop down.
 *
 * This store centralises that state while keeping the same semantics
 * (event ring buffer, auto-open Debug on error). Components read
 * slices with `useAppStore(s => s.slice)` so only the bits they
 * actually consume cause re-renders.
 *
 * Keep this file free of React/DOM imports; it must remain testable
 * and renderer-process-compatible.
 */
import { create } from "zustand";
import type { AgentRole, ChatMessage, ExecutionEvent } from "./types";
import type { FailureLogEntry } from "./types";

/**
 * Maximum number of entries the in-memory execution-event ring buffer
 * keeps before oldest entries are dropped. Matches the cap previously
 * enforced inline in `App.tsx`.
 */
export const EVENTS_CAP = 500;
export const FAILURES_CAP = 50;

export type HealthStatus = boolean | null;

/**
 * Narrows the copy rendered in TaskPanel's pre-execution "planning…"
 * chip. `null` means no goal is currently in the planning phase.
 * Scenario-A §9.2 F-2: without this, the pane was silent for the
 * entire 2+ minute plan phase on small local models.
 */
export type GoalPlanningPhase = "scanning" | "planning" | null;

export interface AppState {
  // --- session identity ---
  projectDir: string | null;
  /** fs-change tick — incremented every time watcher fires a change. */
  fsTick: number;

  // --- health probes ---
  plannerOk: HealthStatus;
  executorOk: HealthStatus;

  // --- chat ---
  messages: ChatMessage[];

  // --- execution / debug log (ring-buffered) ---
  events: ExecutionEvent[];

  // --- failures log (project-scoped, capped) ---
  failures: FailureLogEntry[];

  // --- pre-execution planning chip (F-2) ---
  goalPlanning: GoalPlanningPhase;

  // --- UI toggles ---
  debugOpen: boolean;
  explorerOpen: boolean;
  settingsOpen: boolean;
  bottomPanelHeight: number;

  // --- actions ---
  setProjectDir: (dir: string | null) => void;
  bumpFsTick: () => void;
  setPlannerOk: (ok: HealthStatus) => void;
  setExecutorOk: (ok: HealthStatus) => void;

  setGoalPlanning: (phase: GoalPlanningPhase) => void;

  setMessages: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  resetMessages: () => void;

  /** Append to the event log with ring-buffer trimming. */
  pushEvent: (e: ExecutionEvent) => void;
  /** Append an error and auto-open the Debug panel. */
  pushError: (text: string, role?: AgentRole) => void;
  replaceEvents: (events: ExecutionEvent[]) => void;
  clearEvents: () => void;

  setFailures: (failures: FailureLogEntry[]) => void;
  pushFailure: (f: FailureLogEntry) => void;
  clearFailures: () => void;

  setDebugOpen: (v: boolean) => void;
  setExplorerOpen: (v: boolean) => void;
  toggleDebug: () => void;
  toggleExplorer: () => void;
  setSettingsOpen: (v: boolean) => void;
  setBottomPanelHeight: (v: number) => void;
}

/**
 * The single application store. Keep state access scoped with
 * selectors in consumers to avoid spurious re-renders — e.g.
 * `useAppStore(s => s.messages)` not `useAppStore()`.
 */
export const useAppStore = create<AppState>((set) => ({
  projectDir: null,
  fsTick: 0,
  plannerOk: null,
  executorOk: null,
  messages: [],
  events: [],
  failures: [],
  goalPlanning: null,
  debugOpen: false,
  explorerOpen: true,
  settingsOpen: false,
  bottomPanelHeight: 240,

  setProjectDir: (dir) => set({ projectDir: dir }),
  bumpFsTick: () => set((s) => ({ fsTick: s.fsTick + 1 })),
  setPlannerOk: (ok) => set({ plannerOk: ok }),
  setExecutorOk: (ok) => set({ executorOk: ok }),

  setGoalPlanning: (phase) => set({ goalPlanning: phase }),

  setMessages: (updater) =>
    set((s) => ({
      messages:
        typeof updater === "function"
          ? (updater as (prev: ChatMessage[]) => ChatMessage[])(s.messages)
          : updater,
    })),
  resetMessages: () => set({ messages: [] }),

  pushEvent: (e) =>
    set((s) => {
      const trimmed =
        s.events.length >= EVENTS_CAP
          ? s.events.slice(-(EVENTS_CAP - 1))
          : s.events;
      return { events: [...trimmed, e] };
    }),
  pushError: (text, role) =>
    set((s) => {
      const entry: ExecutionEvent = {
        kind: "error",
        text,
        role,
        at: Date.now(),
      };
      const trimmed =
        s.events.length >= EVENTS_CAP
          ? s.events.slice(-(EVENTS_CAP - 1))
          : s.events;
      return {
        events: [...trimmed, entry],
        // Silent collapsed Debug on a failed run is exactly the UX
        // the audit flagged — pop it open the moment something fails.
        debugOpen: true,
      };
    }),
  replaceEvents: (events) => set({ events }),
  clearEvents: () => set({ events: [] }),

  setFailures: (failures) =>
    set({ failures: failures.slice(-FAILURES_CAP).sort((a, b) => b.at - a.at) }),
  pushFailure: (f) =>
    set((s) => ({
      failures: [f, ...s.failures].slice(0, FAILURES_CAP),
      debugOpen: true,
    })),
  clearFailures: () => set({ failures: [] }),

  setDebugOpen: (v) => set({ debugOpen: v }),
  setExplorerOpen: (v) => set({ explorerOpen: v }),
  toggleDebug: () => set((s) => ({ debugOpen: !s.debugOpen })),
  toggleExplorer: () => set((s) => ({ explorerOpen: !s.explorerOpen })),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setBottomPanelHeight: (v) => set({ bottomPanelHeight: v }),
}));
