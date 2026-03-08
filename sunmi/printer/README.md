# Printer integration architecture (contract-first)

This folder documents printer architecture for Sunmi devices.

## Technical honesty

Browser JS in Sunmi WebView **cannot directly control** the built-in Sunmi printer without a native Android bridge.

## Layers

1. **Sunmi web app shell** (`sunmi/src/main.js` + services)
   - creates print intent/print job data
   - requests print operations through adapter contract
2. **Printer adapter boundary** (`sunmi/src/boundaries/printerAdapter.js`)
   - stable interface used by web shell
3. **Native bridge layer** (future)
   - Android wrapper exposing safe bridge methods to web layer
4. **Sunmi SDK layer** (future native)
   - actual printer device APIs and hardware operations

## Current status

- Contract + unavailable web adapter exists.
- No fake printer implementation.
- No direct Sunmi SDK calls in this repository yet.

## Print job contract

Defined in `sunmi/src/boundaries/printJobContract.js` with fields for:
- restaurant metadata
- order identifiers
- customer details
- line items/modifiers
- totals
- timestamps
- notes
- formatting hints

## Future work TODO

- Implement native bridge adapter for `isAvailable`, `printReceipt`, `getPrinterInfo`, and optional `openCashDrawer`.
- Map structured `PrintJob` into Sunmi SDK print calls in native layer.
- Add printer capability negotiation (paper width/cutter/drawer support).


## Current native PoC location

- Android wrapper + JS bridge PoC: `native/android/`
- Build/install instructions: `native/android/README.md`
