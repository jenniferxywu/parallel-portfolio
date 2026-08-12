# Parallel integration guide

Parallel combines Moomoo and Bitget into one read-only portfolio view. It intentionally contains no order, transfer, or withdrawal code.

## Bitget

Create a read-only API key for a Unified Trading Account. Add the API key, secret, and passphrase to the runtime variables listed in `.env.example`. The server signs `GET /api/v3/account/assets`; secrets never reach the browser.

## Moomoo

Moomoo exposes account data through the desktop OpenD gateway, not a cloud REST API. Run OpenD on a trusted machine and place a small private HTTP bridge in front of it. Set `MOOMOO_BRIDGE_URL` and, strongly recommended, `MOOMOO_BRIDGE_TOKEN`.

The bridge must expose `GET /portfolio` with this shape:

```json
{
  "total": 132480.2,
  "cash": 8984.0,
  "positions": [
    {
      "symbol": "NVDA",
      "name": "NVIDIA",
      "type": "Equity",
      "marketValue": 38124.4,
      "quantity": 211,
      "pnl": 6280.2,
      "pnlPct": 19.72
    }
  ]
}
```

Keep the bridge private, require its bearer token, and do not expose OpenD directly to the public internet.
