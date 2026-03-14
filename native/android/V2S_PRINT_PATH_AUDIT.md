# Sunmi V2s Printing: Final Classification and Replacement Direction

## Final device findings (ground truth)
- Non-buffer `printText` via bridge/AIDL is physically unreliable on Sunmi V2s.
- Non-buffer bitmap paths did not produce reliable physical output.
- Official parity buffered path was executed and reached `enterPrinterBuffer(clean=true)`.
- Sunmi service crashed in buffer flow with NPE (`TransBean.l()` null object reference).
- Parity layer summary shows:
  - readiness: passed
  - bufferEnter: failed (`service_null_pointer`)
  - contentDispatch: not started
  - commit: not started
  - exit: not started

## Conclusion
Current WebView bridge + AIDL sequencing is **unsuitable for V2s production printing**.

Status fields used in native results:
- `architectureStatus=UNSUITABLE_BRIDGE_AIDL_V2S`
- `bufferApiStatus=CRASHES_IN_SERVICE`
- `nonBufferTextStatus=UNRELIABLE`
- `nonBufferBitmapStatus=NO_PHYSICAL_OUTPUT`
- `recommendedNextStep=DEDICATED_NATIVE_PRINT_SERVICE`

## Replacement architecture options

### 1) Local HTTP server in native app
- Pros: simple request model from web layer, easy payload evolution.
- Cons: lifecycle/network surface area, local server hardening required.

### 2) Android Intent/Broadcast handoff
- Pros: Android-native IPC, low implementation effort.
- Cons: delivery/retry/ordering semantics are weaker unless extra queue layer is added.

### 3) Persistent native queue with polling sync
- Pros: strongest reliability and observability, robust offline/retry handling.
- Cons: highest implementation complexity.

### 4) WebSocket/native listener model
- Pros: real-time bidirectional signaling.
- Cons: more moving parts than needed for receipt dispatch.

## Preferred option (production-practical)
**Option 2 + small persistent queue in native app**:
- Use Intent/Binder-style command handoff from web shell to native print module.
- Native module owns service binding, readiness checks, buffer lifecycle, retries, and printer diagnostics.
- Add minimal local persistence for queued print commands to survive process restarts.

This is the simplest practical path with enough reliability for restaurant operations.

## Minimum web-to-native contract
Web layer is command source only (no low-level printer sequencing).

Command payload (web -> native):
- `commandId`
- `orderId`
- `ticketType`
- `contentModel` (structured receipt lines/items/totals)
- `requestedCopies`
- `createdAt`

Result payload (native -> web/backend):
- `ok` (dispatch outcome only)
- `errorCode`
- `retryable`
- `needsAttention`
- `recommendedAction`
- `acceptedByBridge`
- `nativeDispatchAttempted`
- `physicalPrintUnverified`
- `architectureStatus`
