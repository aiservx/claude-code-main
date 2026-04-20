# Provider Routing (Phase 2)

This document describes how the Tauri desktop app in `desktop/` routes
each agent role (planner, executor, reviewer) to a concrete backend
provider (OpenRouter or Ollama), what happens on failure, and how to
configure the router from the Settings UI.

> Scope: This is the backend-side Phase 2 spec. The React/Ink UI work
> for timeline badges and thinking blocks is Phase 3+; this document
> only covers the dispatcher, per-role model overrides, and the
> failure matrix.

## 1. Why routing?

The multi-agent loop has three roles, each with different needs:

| Role     | Dominant workload           | Sensible provider                |
| -------- | --------------------------- | -------------------------------- |
| Planner  | long-context reasoning      | OpenRouter (frontier models)     |
| Executor | high-throughput tool calls  | Ollama (local, no per-token fee) |
| Reviewer | short critique of a result  | OpenRouter (frontier models)     |

Forcing every role onto one provider wastes money (cloud executor) or
reasoning quality (local planner). `provider_mode` lets the user pick
the trade-off, and `call_model` dispatches each role independently.

## 2. Modes

Three modes, selected by `Settings.provider_mode`:

- **`cloud`** — every role runs on OpenRouter. No fallback. Requires
  `openrouter_api_key`. Best when Ollama is unavailable (no GPU, air
  travel, restricted network).
- **`local`** — every role runs on Ollama. No fallback. No network
  required. Best when privacy is paramount or the cloud is unreachable.
- **`hybrid`** — planner + reviewer on OpenRouter, executor on Ollama;
  each role falls back to the other provider when its primary fails
  (see §3). Best default for a workstation that has both configured.

The backend resolves mode + role into `(primary, fallback)` via:

```rust
fn resolve_provider(settings: &Settings, role: Role) -> (Provider, Option<Provider>) {
    match settings.provider_mode {
        ProviderMode::Cloud => (Provider::OpenRouter, None),
        ProviderMode::Local => (Provider::Ollama, None),
        ProviderMode::Hybrid => match role {
            Role::Planner | Role::Reviewer => (Provider::OpenRouter, Some(Provider::Ollama)),
            Role::Executor => (Provider::Ollama, Some(Provider::OpenRouter)),
        },
    }
}
```

## 3. Failure matrix

The dispatcher (`call_model` in `desktop/src-tauri/src/ai.rs`) follows
this exact contract when a role makes a model call:

1. Resolve `(primary, fallback)` for the role.
2. Call the primary provider with the role's resolved model.
3. On primary failure (network error, HTTP 5xx, stream drop, timeout):
   - If the user cancelled the turn, propagate the cancel — do **not**
     retry on the fallback.
   - If no fallback is configured for this mode, return the primary
     error.
   - If the fallback provider has no credentials (e.g. OpenRouter
     without an API key), return the primary error.
   - Otherwise emit `ai:error` with `{provider, model, fallback_provider,
     fallback_model, role, message}` so the UI can badge the swap, then
     call the fallback.
4. If both providers fail, return a combined error string that names
   both attempts.

The table below summarises the observable behaviour per mode + role +
failure kind:

| Mode   | Role     | Primary | Fallback | Behaviour on primary fail                                  |
| ------ | -------- | ------- | -------- | ---------------------------------------------------------- |
| cloud  | any      | OR      | —        | error surfaced; no retry                                   |
| local  | any      | Ollama  | —        | error surfaced; no retry                                   |
| hybrid | planner  | OR      | Ollama   | `ai:error` banner, retry on Ollama                         |
| hybrid | executor | Ollama  | OR       | `ai:error` banner, retry on OR (if key present)            |
| hybrid | reviewer | OR      | Ollama   | `ai:error` banner, retry on Ollama                         |

User-initiated cancel never triggers the fallback path.

## 4. Per-role model overrides

Each role can override its provider's default model via Settings:

| Slot              | Default when empty                    |
| ----------------- | ------------------------------------- |
| `planner_model`   | provider-default (`openrouter_model` or `ollama_model`) |
| `executor_model`  | provider-default                      |
| `reviewer_model`  | provider-default                      |

The default for each slot is the empty string, which means "use
whichever provider gets routed". When the user sets an explicit model
(e.g. `anthropic/claude-3.5-sonnet` for the planner), that value is
passed verbatim to `stream_openrouter` / `stream_ollama` regardless of
which provider actually serves the call. This means a per-role model
only makes sense when you know which provider will run that role in
your chosen mode (or when you fix a model that both providers happen
to accept).

## 5. Cost & performance notes

- **Planner** runs once per goal. Small win from a cheap model, because
  the turn is usually short. Premium models are worth it — planning
  mistakes cascade through every executor step.
- **Executor** runs many times per turn (every tool iteration is a
  model call). Cost scales fastest here. Local Ollama models are
  typically 5–20× cheaper at the margin than an OpenRouter frontier
  model, and throughput is often comparable for a 6–13B tool-calling
  model.
- **Reviewer** runs at most once per task when `reviewer_enabled` is
  on. Short input (executor summary + tool outputs), short output
  (verdict). Cheap either way; a smarter reviewer catches hallucinated
  success claims.

## 6. Health probes

Two commands expose provider reachability to the Settings UI:

- `probe_ollama(base_url, model?)` — hits `/api/tags` and checks the
  model catalog. Timeout raised from 3s → 10s to accommodate
  cold-start of `ollama serve` and remote LAN daemons.
- `probe_openrouter(api_key, model?)` — hits `/api/v1/models` (no
  auth) for reachability + model catalog, then `/api/v1/auth/key` for
  key validity + remaining credits. Timeout 10s.

Both return `reachable`, `model_available`, `error`, and `available_models`.
The OpenRouter probe additionally returns `key_valid` and
`credits_remaining`.

## 6a. Model-capability floor

Not every model can drive every role. The executor in particular has
to emit JSON-shaped tool calls on a structured schema; small models
fail this silently (they stream prose or planner-style JSON instead,
and the reviewer then marks the turn `review skipped (unparsed)`).

Tested minimums, empirically validated against Scenario A (see
`PROJECT_MEMORY.md §9.2` for the full reproduction):

| Role     | Minimum size | Known-good local models                                   | Known-bad (do not use) |
| -------- | ------------ | ---------------------------------------------------------- | ---------------------- |
| Executor | **≥ 7 B**    | `qwen2.5-coder:7b`, `llama3.1:8b`, `deepseek-coder:6.7b` | `llama3.2:1b` — fails |
| Planner  | ≥ 3 B        | `qwen2.5-coder:7b`, `llama3.1:8b`, `llama3.2:3b`          | `llama3.2:1b`          |
| Reviewer | ≥ 3 B        | `qwen2.5-coder:7b`, `llama3.1:8b`, `llama3.2:3b`          | `llama3.2:1b`          |

The Executor floor is the strictest because it's the only role that
must emit structured tool calls; the Planner and Reviewer need short
JSON verdicts or plans which 3 B models can produce reliably enough.

The Settings UI shows an amber advisory under any Planner / Executor
model field whose name matches `:?[123](\.[05])?\s*b` (heuristic; see
`modelLooksSmall` in `components/Settings.tsx`) so a user can't
silently configure an unsupported combination. The Chat tier also
renders a visible SystemAction bubble when the backend detects an
unparsed executor turn at runtime (`ai:executor_unparsed` event —
fires on iteration-0 empty tool calls, or on `ReviewVerdict::Unknown`).

## 7. Backward compatibility

The settings file carries `provider_mode` with a `#[serde(default)]`
fallback. Pre-Phase-2 settings files deserialize with:

- `provider_mode = Hybrid` when the environment variable
  `OPENROUTER_API_KEY` is non-empty at load time.
- `provider_mode = Local` otherwise.

Per-role model slots default to `""`, so existing installs keep their
provider-default models until the user opts into an override.

## 8. Extending

To add a third provider (e.g. Anthropic direct):

1. Add a `Provider::Anthropic` variant next to the existing two.
2. Extend `provider_has_credentials`, `model_for_role`, and
   `call_provider` to cover it.
3. Decide how `ProviderMode::Hybrid` should route to it (or introduce
   a new mode).
4. Add `stream_anthropic(...)` with the same signature contract as
   `stream_openrouter` / `stream_ollama`: accept an optional
   `model_override`, emit `ai:token` while streaming, return a
   `WireMessage` once the stream finalises.

No other caller of `call_model` needs to change — routing is centralised.
