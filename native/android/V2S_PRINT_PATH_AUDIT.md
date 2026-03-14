# Sunmi V2s Print Path Audit (Bridge/AIDL)

## Scope
This audit compares the current bridge-based AIDL invocation flow in `SunmiPrinterManager` with the operational expectations from Sunmi V2s integrations, based on observed device behavior and current code paths.

## What is already proven on-device
- `printText` is unreliable even with minimal synthetic ASCII payloads.
- Chunked bitmap with ARGB/non-monochrome failed.
- Chunked bitmap with strict monochrome (`RGB_565`, `monochrome=true`, `hasAlpha=false`, `otherPixelCount=0`) still produced no physical output.

## Current bridge flow in this repository
1. Bind service through `com.sunmi.peripheral.printer.InnerPrinterService` first, then legacy `woyou.aidlservice.jiuiv5` fallback.
2. Optionally call `printerInit`.
3. Set alignment.
4. Dispatch content (`printText` or `printBitmap`).
5. Send final feed via `sendRAWData(ESC d)` with lineWrap fallback.
6. Poll `updatePrinterState` around dispatch and log callback telemetry.

## Gaps / risk areas relative to official-equivalent integration behavior
1. **No stable buffer-mode execution path on V2s**
   - Buffer API is intentionally disabled due crash behavior (`enterPrinterBuffer` path ruled out).
   - Many Sunmi samples rely on buffered transaction semantics for deterministic flush/commit behavior.
2. **Bridge invocation may miss hardware/service lifecycle assumptions**
   - Browser bridge round-trips are not the same as tightly-coupled native activity/service execution contexts used in OEM sample apps.
3. **Service-family variance risk on V2s firmware builds**
   - Different firmware/service variants may require specific method combinations or ordering not fully mirrored here.
4. **Printer state readiness may require stricter gating than currently implemented**
   - Current flow logs state but does not enforce a firmware-specific readiness state machine prior to dispatch.

## Recommendation
Given repeated negative evidence across text + bitmap variants, **stop iterating on receipt rendering variants in this bridge as the primary recovery path**.

Proceed with one of these options:

### Option A (preferred): dedicated native Android print app/service
- Build a minimal native printer module based directly on the official Sunmi V2s sample architecture.
- Keep web layer as a command source only (IPC/intent/message), not the dispatcher of low-level print sequencing.
- Implement and validate exact official-equivalent initialization + transaction lifecycle in native.

### Option B: strict official-flow parity experiment in current module
Before abandoning bridge path completely, run one parity sprint:
1. Mirror official sample method family and ordering exactly.
2. Add readiness-state gating and explicit transactional boundaries.
3. Validate against the same synthetic harness payloads.
4. If still no reliable physical output, retire bridge AIDL path for V2s.

## Exit criteria
Move forward only when one path prints consistently on physical V2s for:
- synthetic text baseline,
- synthetic bitmap baseline,
- real receipt payload.

If not achieved with official-equivalent sequence, classify current bridge/AIDL architecture as unsuitable for V2s production printing.
