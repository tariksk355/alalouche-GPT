# Dedicated native print service architecture (Sunmi V2s)

This note defines a transport/execution/lifecycle redesign that keeps the current receipt content pipeline and order workflow intact while moving printer reliability concerns into a dedicated native layer.

## A. Product / UX principles

1. **One product, one workflow**
   - The owner works from the existing receiver/order screen.
   - Printing status appears inline with each order row/card, never as a separate operational app flow.
   - Any "Print Center" UI is opened from inside the receiver app and branded as a built-in panel, not as a second product.

2. **Hide transport complexity**
   - No user-facing mention of AIDL, SDK mode, buffers, callbacks, polling, or bind/rebind lifecycle.
   - User sees only business language: "Queued", "Printing", "Printed", "Needs attention".

3. **Deterministic operator feedback**
   - Every print attempt must have a durable state transition and timestamp.
   - A job is never shown as ambiguous (e.g., spinner forever).

4. **Safe retries, low cognitive load**
   - Retry happens from the same order context with one tap.
   - The user should not choose transport options; they choose only intent: "Retry" or "Reprint".

5. **Idempotent behavior first**
   - Duplicate prints are controlled through job identity and reprint intent.
   - "Print" and "Reprint" are explicit and auditable.

## B. Recommended visible states and user messages

Use a constrained state model in UI (mapped from richer native internals):

1. **Queued**
   - Message: "Ticket en file d'impression..."
   - Trigger: job accepted by native print service and persisted.

2. **Printing**
   - Message: "Impression en cours..."
   - Trigger: worker locked the job and started device execution.

3. **Printed**
   - Message: "Imprimé à HH:MM"
   - Trigger: execution completed with success status from native layer.

4. **Needs attention**
   - Message: "Impression échouée. Vérifiez le papier/imprimante puis réessayez."
   - Trigger: retry budget exhausted or terminal error class.
   - Primary action: **Retry**.
   - Secondary action: **Open print details**.

5. **Retry scheduled** (optional badge, can be hidden for simplicity)
   - Message: "Nouvelle tentative automatique..."
   - Trigger: transient error with backoff retry pending.

### Failure and retry UX behavior

- **Automatic retries**: short bounded retry policy for transient errors (service disconnected, busy, temporary I/O).
- **Manual retry**: available whenever state is "Needs attention".
- **Reprint**: available after "Printed"; creates a new job with `reason=reprint` to preserve audit trail.
- **No dual-console operations**: retry/reprint controls live on existing order card/detail screen.

## C. Technical architecture proposal

## 1) Core idea

Introduce a **Native Print Service Layer** inside Android that becomes the sole owner of:
- job queue persistence,
- printer session lifecycle,
- execution + retry policy,
- job state transitions and observability.

Existing JS/web continues to own:
- order intake,
- receipt content generation (`normalizeOrderForDisplay`, `displaySections`, `receiptLines`, `buildPrintJobFromOrder`),
- operator workflow.

## 2) Components

1. **PrintJobStore (Room/SQLite)**
   - Persists jobs and transitions:
     - `jobId`, `orderId`, `tenantId`, `payloadJson`, `status`, `attemptCount`, `maxAttempts`, `errorCode`, `errorMessage`, timestamps.
   - Guarantees durability across process death/reboot.

2. **PrintQueueOrchestrator (Foreground-safe worker manager)**
   - Owns dequeue/lock/execute/retry loop.
   - Single-writer semantics per printer device.

3. **PrinterExecutor**
   - Receives normalized payload and executes through selected transport.
   - Uses current seam (`PrinterTransport`, `TransportSelector`, `AidlTransport`, future `SunmiSdkTransport`) without exposing this to JS.

4. **PrintStatePublisher**
   - Emits state changes to JS bridge (polling + optional event callbacks).
   - Maintains stable UI contract regardless of underlying transport.

5. **Bridge Facade (SunmiJsBridge contract-compatible)**
   - Keeps `printReceipt(...)` entry point.
   - Behavior change: enqueue-and-return `jobId` immediately rather than blocking on physical completion.

## 3) Handoff flow

1. Web builds print payload using existing formatter pipeline.
2. `SunmiJsBridge.printReceipt(payload)` called as today.
3. Bridge validates payload, creates `jobId`, writes to `PrintJobStore` as `QUEUED`.
4. Orchestrator picks job, marks `PRINTING`, executes via `PrinterExecutor`.
5. On success -> `PRINTED`; on transient failure -> `RETRY_SCHEDULED`; on exhausted failure -> `NEEDS_ATTENTION`.
6. Web UI reads job state (by `jobId` / `orderId`) and updates inline badges/actions.

## 4) Queue ownership and concurrency

- Queue is **native-owned** (not JS memory).
- One active job per physical printer.
- Additional jobs remain queued FIFO, with optional priority for "manual retry now".
- Dedup strategy:
  - `print` intent with same `orderId` and same payload hash within short window -> coalesce or reject duplicate.
  - `reprint` intent always creates a distinct job.

## 5) Retry/reprint model

- Retry policy example: 3 attempts (0s, 3s, 10s backoff).
- Error classification table in native layer:
  - transient: disconnected/busy/timeouts,
  - terminal: unsupported call/payload invalid.
- Manual retry resets state and increments `manualRetryCount`.
- Reprint clones last successful payload with new `jobId` and reason metadata.

## D. How it fits into current repo/app structure

Recommended minimal fit with current modules:

1. **Keep unchanged (web/business):**
   - `sunmi/src/boundaries/orderFormatter.js`
   - `sunmi/src/boundaries/printJobContract.js`
   - existing order receiver flow and UI composition.

2. **Keep bridge API stable:**
   - `native/android/app/src/main/java/com/alalouche/sunmibridge/SunmiJsBridge.kt`
   - continue exposing `printReceipt(...)`, but route to enqueue path.

3. **Extend Android with service-layer package:**
   - New package: `com.alalouche.sunmibridge.printservice`
   - Suggested classes:
     - `PrintJobEntity`, `PrintJobDao`, `PrintDatabase`
     - `PrintQueueOrchestrator`
     - `PrintExecutor`
     - `PrintRetryPolicy`
     - `PrintStateMapper` (native->UI states)

4. **Reuse existing transport seam instead of replacing content pipeline:**
   - `transport/PrinterTransport.kt`
   - `transport/TransportSelector.kt`
   - current/future transport implementations remain behind executor.

5. **UI integration path:**
   - Add lightweight JS adapter methods:
     - `getPrintStatus(orderId|jobId)`
     - `retryPrint(jobId)`
     - `reprint(orderId)`
   - These are additive; existing `printReceipt` callers remain valid.

## E. Smallest practical first version (MVP)

**Goal:** reliability gains with minimal product change.

1. Implement native durable queue + single worker.
2. Keep only 4 visible states: Queued / Printing / Printed / Needs attention.
3. Preserve current `printReceipt(...)` input payload unchanged.
4. Return `jobId` + initial `QUEUED` response immediately.
5. Add one status endpoint (`getPrintStatus(jobId)`) and one action (`retryPrint(jobId)`).
6. Keep current transport implementation behind executor (no micro-tuning branch work exposed to UX).
7. Add "Print details" drawer only if needed for support; hide by default.

This MVP avoids a separate launcher app while still introducing dedicated queue/lifecycle ownership.

## F. Risks / tradeoffs

### Advantages
- Stronger operational reliability via durable queue and lifecycle control.
- Clear job state model for operators.
- Preserves existing receipt content correctness and bridge contract.
- Easier future transport swaps (Sunmi SDK, vendor abstraction) without UI churn.

### Tradeoffs
- More Android complexity (database + worker + state synchronization).
- Need careful idempotency rules to avoid accidental duplicates.
- New observability requirements (logs/metrics per job).
- Slightly more async UX (job accepted before physically printed).

### Key risk mitigations
- Explicit job IDs shown in support/debug panel.
- Strict state machine with terminal/non-terminal classes.
- Integration tests around queue persistence + retry transitions.

## G. Recommended next implementation step

1. **Define and freeze the print job state machine** (`QUEUED`, `PRINTING`, `PRINTED`, `RETRY_SCHEDULED`, `NEEDS_ATTENTION`) plus transition rules.
2. **Implement PrintJobStore + orchestrator skeleton** in `native/android` and wire `SunmiJsBridge.printReceipt(...)` to enqueue.
3. **Expose minimal status API** to web adapter (`getPrintStatus(jobId)`), then show inline order badge states.
4. **Run on-device validation** focused on lifecycle outcomes (process restart, temporary disconnect, paper-out, retry) rather than transport micro-behavior.

This sequence gives immediate product-visible stability improvements while preserving existing receipt generation and user flow.
