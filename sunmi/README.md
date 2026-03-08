# Sunmi integration area

This folder isolates **Sunmi-specific** implementation concerns from generic web frontend and backend logic.

## Scope
- `pairing/`: UI/flow contracts for manual pairing code entry and polling `/devices/verify`.
- `storage/`: secure token storage strategy for Android/Sunmi apps.
- `printer/`: printer bridge abstractions that can call a native Android bridge.
- `receiver/`: device receiver workflow orchestration.
- `docs/`: integration notes and constraints.

## Important constraints
- Pure web can render receiver UIs and call backend APIs.
- Direct Sunmi printing and hardware integrations generally require Android native bridge / Sunmi SDK.
- No fake Sunmi APIs are defined in this repo.
