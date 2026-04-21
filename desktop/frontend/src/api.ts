import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AgentRole,
  ChatMessage,
  ConfirmRequest,
  FailureLogEntry,
  FsChange,
  FsEntry,
  ProjectMap,
  Settings,
  StepEvent,
  TaskTree,
  ToolCall,
  ToolResult,
} from "./types";

/** Thin wrapper over Tauri `invoke` with typed commands. */
export const api = {
  listDir: (project_dir: string, sub_path: string) =>
    invoke<FsEntry[]>("list_dir", { projectDir: project_dir, subPath: sub_path }),

  readFile: (project_dir: string, sub_path: string) =>
    invoke<string>("read_file", { projectDir: project_dir, subPath: sub_path }),

  writeFile: (project_dir: string, sub_path: string, content: string) =>
    invoke<string>("write_file", {
      projectDir: project_dir,
      subPath: sub_path,
      content,
    }),

  watchDir: (project_dir: string) =>
    invoke<void>("watch_dir", { projectDir: project_dir }),

  unwatchDir: (project_dir: string) =>
    invoke<void>("unwatch_dir", { projectDir: project_dir }),

  runCmd: (project_dir: string, cmd: string, timeout_ms?: number) =>
    invoke<{ stdout: string; stderr: string; exit_code: number }>("run_cmd", {
      projectDir: project_dir,
      cmd,
      timeoutMs: timeout_ms ?? 30000,
    }),

  runCmdStream: (
    terminal_id: string,
    project_dir: string,
    cmd: string,
    timeout_ms?: number,
  ) =>
    invoke<{ stdout: string; stderr: string; exit_code: number }>("run_cmd_stream", {
      terminalId: terminal_id,
      projectDir: project_dir,
      cmd,
      timeoutMs: timeout_ms ?? 30000,
    }),

  terminalKill: (terminal_id: string) =>
    invoke<void>("terminal_kill", { terminalId: terminal_id }),

  sendChat: (
    project_dir: string,
    message: string,
    history: ChatMessage[],
  ): Promise<{
    assistant: string;
    tool_calls: ToolCall[];
    tool_results: ToolResult[];
    steps: StepEvent[];
    /** How many times the executor looped before this turn ended. */
    executor_iterations?: number;
  }> => invoke("send_chat", { projectDir: project_dir, message, history }),

  cancelChat: () => invoke<void>("cancel_chat"),

  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) =>
    invoke<void>("save_settings", { settings }),

  /** Persist `project_dir` as the user's most recently opened project.
   *  Called from the `open_project` flow so a subsequent boot can
   *  auto-restore it. Scenario-A §9.2 F-8. */
  setLastProjectDir: (project_dir: string) =>
    invoke<void>("set_last_project_dir", { projectDir: project_dir }),

  /** Read the persisted last-opened project dir, if any. */
  getLastProjectDir: () =>
    invoke<string | null>("get_last_project_dir"),

  checkPlanner: () => invoke<boolean>("check_planner"),
  checkExecutor: () => invoke<boolean>("check_executor"),

  /**
   * Detailed Ollama probe using form-level URL + model (no save needed).
   * Returns `{ reachable, model_available, error?, available_models }`.
   */
  probeOllama: (base_url: string, model?: string) =>
    invoke<{
      reachable: boolean;
      model_available: boolean;
      error: string | null;
      available_models: string[];
    }>("probe_ollama", { baseUrl: base_url, model: model ?? null }),

  /**
   * Detailed OpenRouter probe using form-level API key + model. Mirrors
   * `probeOllama`. Returns reachability, key validity, model catalog
   * membership, and remaining credits when OpenRouter reports them.
   */
  probeOpenrouter: (api_key: string, model?: string) =>
    invoke<{
      reachable: boolean;
      key_valid: boolean;
      model_available: boolean;
      error: string | null;
      available_models: string[];
      credits_remaining: number | null;
    }>("probe_openrouter", { apiKey: api_key, model: model ?? null }),

  /** Resolve a pending `ai:confirm_request` (run_cmd safety gate). */
  confirmCmd: (id: string, approved: boolean) =>
    invoke<void>("confirm_cmd", { id, approved }),

  /** Start the autonomous task engine on a high-level user goal. */
  startGoal: (
    project_dir: string,
    goal: string,
  ): Promise<{
    goal_id: string;
    status: string;
    completed: number;
    failed: number;
  }> => invoke("start_goal", { projectDir: project_dir, goal }),

  /** Cooperatively cancel the top-level goal loop. */
  cancelGoal: () => invoke<void>("cancel_goal"),

  /** Scan the opened project and persist the resulting project_map. */
  scanProject: (project_dir: string) =>
    invoke<ProjectMap>("scan_project_cmd", { projectDir: project_dir }),

  /** Load the most-recently-persisted active task tree, if any. */
  loadTaskTree: (project_dir: string) =>
    invoke<TaskTree | null>("load_task_tree", { projectDir: project_dir }),

  /** Load the persisted failures log. */
  loadFailuresLog: (project_dir: string) =>
    invoke<FailureLogEntry[]>("load_failures_log", { projectDir: project_dir }),

  /** Clear the persisted failures log (project-scoped). */
  clearFailuresLog: (project_dir: string) =>
    invoke<void>("clear_failures_log", { projectDir: project_dir }),
};

export type BackendEvent =
  | "ai:token"
  | "ai:tool_call"
  | "ai:tool_result"
  | "ai:step"
  | "ai:done"
  | "ai:error"
  | "ai:confirm_request"
  | "ai:executor_unparsed"
  | "fs:changed"
  | "task:goal_started"
  | "task:added"
  | "task:update"
  | "task:trace"
  | "task:goal_done"
  | "task:failure_logged"
  | "task:circuit_tripped"
  | "project:scan_done"
  | "goal:planning"
  | "goal:planning_done"
  | "terminal:output"
  | "terminal:done";

/** Listen to a backend event. Returns an unlisten function. */
export async function onEvent<T>(
  name: BackendEvent,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return listen<T>(name, (e) => handler(e.payload));
}

export type FsChangeEvent = FsChange;

export type TokenEvent = { text: string; role: AgentRole };
export type DoneEvent = { assistant: string; iterations: number };
export type ErrorEvent = { message: string; role?: AgentRole };
export type ConfirmEvent = ConfirmRequest;

/**
 * Emitted by the backend when the executor finishes a turn without
 * ever producing a parseable tool call — the canonical small-model
 * failure mode surfaced by Scenario A (§9.2 F-4). The Chat tier
 * listens to this and renders a visible SystemAction so the advice
 * ("try a larger executor") is not buried in the Debug pane.
 *
 * `reason` is a machine-readable discriminator that tells us *where*
 * we caught it (either the executor exited iteration 0 with no tool
 * calls, or the reviewer could not verdict the executor's output).
 * The copy rendered to the user is the same in both cases.
 */
export type ExecutorUnparsedEvent = {
  role: "executor";
  provider: string;
  model: string;
  reason: "no_tool_calls_first_iteration" | "reviewer_verdict_unknown";
};
