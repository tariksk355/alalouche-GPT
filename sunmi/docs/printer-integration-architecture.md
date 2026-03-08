# Sunmi printer integration architecture note

## Objective

Prepare a practical contract so the current web shell can stay lightweight while enabling future reliable Sunmi thermal printing through native bridge.

## Data flow

1. Receiver app obtains order data from backend.
2. Web boundary builds `PrintJob` (structured data only).
3. Web calls `PrinterAdapter.printReceipt(printJob)`.
4. In pure web mode, adapter returns unavailable.
5. In native bridge mode, adapter forwards to Android bridge.
6. Android bridge calls Sunmi SDK and returns result.

## Contract surface

`PrinterAdapter` methods:
- `isAvailable()`
- `printReceipt(printJob)`
- `openCashDrawer()` (optional capability)
- `getPrinterInfo()`

## Why this design

- Avoids fake JS printer behavior.
- Keeps web UI/business logic independent from native SDK details.
- Allows incremental adoption: web now, native later.

## Production recommendation

For built-in Sunmi printer reliability, use native bridge mode with Sunmi SDK.
Pure web mode is suitable for pairing/receiver and non-hardware workflows only.
