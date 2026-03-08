# Sunmi capabilities and boundaries

## What works in pure web
- Pairing code input and pairing-status polling.
- Device bearer-token authenticated API calls to `/receiver/*` endpoints.
- Rendering receiver order queues in a browser/webview.

## What requires native Android bridge / Sunmi SDK
- Direct hardware printer control (ESC/POS commands, paper width control, cutter/beeper).
- Access to secure hardware-backed keystore for production token storage.
- Device model-specific hardware controls.

## Printer architecture note
Use an abstraction boundary:
- `PrinterService` interface in app code
- `WebPrintAdapter` fallback (`window.print`) for non-native mode
- `SunmiNativePrinterAdapter` for Android bridge mode
