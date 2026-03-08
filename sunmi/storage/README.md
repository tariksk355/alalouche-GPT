# Token storage strategy

- Development: local storage may be used for quick testing.
- Production Android/Sunmi: use encrypted storage (Android Keystore backed implementation).
- Never log full bearer tokens.
