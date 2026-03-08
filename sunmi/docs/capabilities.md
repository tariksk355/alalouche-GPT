# Sunmi capabilities and boundaries (realistic)

## What works in pure web (Sunmi browser/WebView)

- Pairing code entry and pairing-status polling via backend APIs.
- Stored-token receiver authentication (`Authorization: Bearer ...`).
- Polling and displaying receiver orders.
- Updating order status via backend endpoints.
- Producing **structured print job data** in JS (data model only).

## What does NOT work in pure web without native bridge

- Direct access to Sunmi built-in thermal printer hardware.
- Reliable ESC/POS command transport to Sunmi printer.
- Cash drawer hardware control from browser JS.
- Hardware-backed secure key/token storage.

## What requires Android native bridge + Sunmi SDK

- Real thermal receipt printing.
- Printer status/model/firmware access from hardware APIs.
- Optional drawer kick where hardware supports it.
- Secure storage implementation backed by Android Keystore.

## Integration modes

### Mode A: Pure web fallback
- Web shell runs all pairing/receiver flows.
- Printing is unavailable or manual fallback only.
- Lowest build complexity, limited hardware integration.

### Mode B: Native bridge mode (recommended for production)
- Web shell still owns pairing/receiver UI logic.
- Native Android layer exposes controlled bridge methods.
- Native layer uses Sunmi SDK for thermal print reliability.

## Recommended production path

Use Mode B for real Sunmi handheld deployments requiring built-in printer reliability.
