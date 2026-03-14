# Native Print Service Decision (Sunmi V2s)

## Decision
Chosen integration model: **D) Hybrid**
- **Primary runtime path:** `WebView JavascriptInterface -> native queue command API only`.
- **Target evolution:** promote queue/worker into a dedicated Android service process with Binder/Intent handoff while keeping the same command/status contract.

## Why this is best for this repository now
- Reuses current WebView shell and bridge wiring with minimal migration risk.
- Immediately removes low-level printer sequencing from JS/web code.
- Allows native queue + deterministic single worker to own printer lifecycle/retry/state.
- Keeps a clean upgrade path to a standalone service/app without breaking web contract.

## Boundaries
- **Web layer:** submit command payloads, query status, render operator actions.
- **Native layer:** binding, lifecycle, queueing, dispatch orchestration, retry policy, error classification, and status truth.

## State machine
`QUEUED -> DISPATCHING -> ACCEPTED_BY_NATIVE -> PRINTED_IF_CONFIRMABLE`

Error/terminal branches:
- `DISPATCHING -> NEEDS_ATTENTION` (retryable/operator action)
- `DISPATCHING -> FAILED` (non-retryable)

Important semantics:
- `ACCEPTED_BY_NATIVE` is **not** physical print success.
- `PRINTED_IF_CONFIRMABLE` is used only if confirmation is genuinely possible.
- Unknown physical completion must be surfaced as unknown, not success.

## Failure handling model
- Structured error codes + retryable flag.
- Queue worker decides retry vs terminal.
- UI consumes machine-readable status (`needsAttention`, `retryable`, `recommendedAction`).
- No success coercion on acceptance-only events.
