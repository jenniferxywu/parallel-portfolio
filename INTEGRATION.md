# Parallel integration guide

Parallel combines Moomoo and Bitget into one read-only portfolio view. It intentionally contains no order, transfer, or withdrawal code.

## Bitget

Create a read-only API key for a Unified Trading Account. Add the API key, secret, and passphrase to the runtime variables listed in `.env.example`. The server signs `GET /api/v3/account/assets`; secrets never reach the browser.

## Moomoo

Moomoo exposes account data through the desktop OpenD gateway, not a cloud REST API. Run OpenD on a trusted machine and use the included `bridge/moomoo_bridge.py`. It only calls the funds and positions query methods; it contains no trading functions.

Install its dependency with `pip3 install -r bridge/requirements.txt`, set a long random `MOOMOO_BRIDGE_TOKEN`, and run `python3 bridge/moomoo_bridge.py`. The bridge binds to `127.0.0.1:8788` by default. Configure the account with `MOOMOO_ACCOUNT_ID`, `MOOMOO_TRADE_MARKET`, and `MOOMOO_SECURITY_FIRM` if their defaults do not match your account.

To use the hosted dashboard, make the bridge reachable only through a trusted private tunnel, then set the hosted `MOOMOO_BRIDGE_URL` and the matching token.

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
