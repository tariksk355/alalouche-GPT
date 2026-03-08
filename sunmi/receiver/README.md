# Receiver workflow

- Poll `GET /receiver/orders` with device bearer token.
- Submit state changes with `POST /receiver/orders/:id/status`.
- Route print jobs through `sunmi/printer` abstraction.
