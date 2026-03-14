# Native Print Service Decision (Sunmi V2s)

## Decision
Chosen integration model: **D) Hybrid**
- **Primary runtime path:** `WebView JavascriptInterface -> native queue command API only`.
- **Target evolution:** promote queue/worker into dedicated Android service process with Binder/Intent handoff while keeping the same command/status contract.

## What is implemented now
- Persistent native print command table (`native_print_jobs`) with restart-safe state.
- Deterministic single-thread queue drain (`NativePrintQueueManager`).
- Real worker execution entrypoint (`SunmiNativePrinterWorker`) that attempts a minimal native dispatch call path.
- Startup reconciliation:
  - `DISPATCHING` -> `NEEDS_ATTENTION` (conservative recovery)
  - `QUEUED` jobs are resumed.
- Command/status/retry APIs exposed to web bridge:
  - `submitPrintCommand`
  - `getPrintCommandStatus`
  - `retryPrintCommand`

## What remains stubbed / incomplete
- Worker dispatch is intentionally minimal and acceptance-oriented; no physical confirmation mechanism is claimed yet.
- Dedicated out-of-process Android print service boundary (Binder/Intent service process split) is not yet implemented.
- Fine-grained printer-specific classification beyond dispatch acceptance/error remains to be implemented in worker.

## State semantics (strict)
- `QUEUED`: persisted, waiting for worker.
- `DISPATCHING`: worker owns command execution.
- `ACCEPTED_BY_NATIVE`: native call path accepted/attempted; **not physical success**.
- `PRINTED_IF_CONFIRMABLE`: only if credible confirmation exists.
- `NEEDS_ATTENTION`: terminal attention-required state (retry may be allowed).
- `FAILED`: terminal non-retryable failure.

## Required log evidence (grep-friendly)
Expected event names include:
- `native_print_command_received`
- `native_print_command_persisted`
- `native_print_queue_drain_start`
- `native_print_worker_started`
- `native_print_state_transition`
- `native_print_dispatch_start`
- `native_print_dispatch_result`
- `native_print_dispatch_error`
- `native_print_terminal_state`

Every event includes `commandId`, plus `orderId` and `sourceJobId` when present.


## Service discovery/binding matrix (implemented)
- Candidate families probed in deterministic order:
  1. `com.sunmi.peripheral.printer` + `com.sunmi.peripheral.printer.InnerPrinterService`
  2. unscoped `com.sunmi.peripheral.printer.InnerPrinterService`
  3. `woyou.aidlservice.jiuiv5` + `woyou.aidlservice.jiuiv5.IWoyouService`
  4. unscoped `woyou.aidlservice.jiuiv5.IWoyouService`
- For each candidate we now log and evaluate:
  - package installed
  - service resolvable
  - bind attempted/succeeded
  - binder null/non-null
  - interface adaptation ready/not ready
- Distinct machine-readable binding failure codes now reported:
  - `NATIVE_PRINT_SERVICE_FAMILY_NOT_FOUND`
  - `NATIVE_PRINT_SERVICE_BIND_FAILED`
  - `NATIVE_PRINT_SERVICE_BINDER_NULL`
  - `NATIVE_PRINT_SERVICE_INTERFACE_UNAVAILABLE`
  - `NATIVE_PRINT_SERVICE_DISPATCH_NOT_ATTEMPTED`
