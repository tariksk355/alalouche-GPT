# Sunmi V2s Print Path Audit (Bridge/AIDL)

## A) Concise gap audit vs official-equivalent flow

### Proven negative evidence (physical V2s)
- AIDL `printText` failed even on minimal synthetic ASCII.
- Bitmap ARGB chunked path failed.
- Bitmap monochrome chunked path (`RGB_565`, `monochrome=true`, `hasAlpha=false`, `otherPixelCount=0`) also failed.

### Current bridge flow (this repo)
1. Bind `InnerPrinterService` (and legacy fallback).
2. Optional `printerInit`.
3. `setAlignment`.
4. Dispatch via `printText` or `printBitmap`.
5. Final feed (`sendRAWData ESC d` with fallback).
6. Log callbacks and printer state.

### Gaps against official-equivalent lifecycle concerns
1. **Readiness gating was mostly observational** (state logged but not enforced as hard precondition).
2. **Transactional parity path was not first-class** in normal experimentation (buffer enter/commit/exit not mirrored as strict sequence).
3. **Callback semantics were over-trusted historically** (service acceptance != physical completion).
4. **Bridge context differs from official native sample context** (service/activity lifecycle assumptions may differ on V2s firmware).

---

## B) Parity sprint implementation plan

Run exactly one official-flow parity sprint in current module with explicit strategy paths:
- `official_parity_synth_text`
- `official_parity_synth_bitmap`
- `official_parity_receipt`

For each strategy, use strict ordering:
1. readiness check (retry-gated)
2. `printerInit`
3. `enterPrinterBuffer(true)`
4. `setAlignment(0)`
5. dispatch content primitive (`printText` or `printBitmap`)
6. `sendRAWData(ESC d)` final feed
7. `commitPrinterBufferWithCallback`
8. `exitPrinterBufferWithCallback(true, ...)`
9. settle wait + post-readiness check

No rendering-tweak experiments are in scope unless required for official parity.

---

## C) Exact parity experiment code path added

Implemented in `SunmiPrinterManager`:
- New parity strategies:
  - `official_parity_synth_text`
  - `official_parity_synth_bitmap`
  - `official_parity_receipt`
- Added strict readiness gating helper:
  - `waitForPrinterReadyState(...)` with retry window and ready-state set.
- Added explicit parity sequence execution and logs:
  - readiness checks
  - exact method ordering
  - payload boundary logs
  - `acceptanceOnly=true` response semantics

---

## D) Exit criteria (hard stop rules)

If the parity path still fails on physical V2s for any of:
- synthetic text baseline,
- synthetic bitmap baseline,
- real receipt payload,

then **stop iterating on bridge rendering tricks**.

### Required replacement architecture
- Build a minimal dedicated native Android printer app/service based directly on official Sunmi sample patterns.
- Web layer sends only high-level print commands.
- Native layer owns binding, readiness gating, initialization, transaction lifecycle, and dispatch.
- Treat callbacks as “service accepted request,” not proof of physical print completion.
