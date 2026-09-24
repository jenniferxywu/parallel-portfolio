"""Read-only HTTP bridge from Parallel to a local Moomoo OpenD gateway."""

import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from moomoo import Currency, OpenSecTradeContext, RET_OK, SecurityFirm, TrdEnv, TrdMarket


BRIDGE_TOKEN = os.environ.get("MOOMOO_BRIDGE_TOKEN", "")
BRIDGE_HOST = os.environ.get("BRIDGE_HOST", "127.0.0.1")
BRIDGE_PORT = int(os.environ.get("BRIDGE_PORT", "8788"))
OPEND_HOST = os.environ.get("MOOMOO_OPEND_HOST", "127.0.0.1")
OPEND_PORT = int(os.environ.get("MOOMOO_OPEND_PORT", "11111"))
ACCOUNT_ID = int(os.environ.get("MOOMOO_ACCOUNT_ID", "0"))
TRADE_MARKET = getattr(TrdMarket, os.environ.get("MOOMOO_TRADE_MARKET", "US").upper())
SECURITY_FIRM = getattr(SecurityFirm, os.environ.get("MOOMOO_SECURITY_FIRM", "FUTUSG").upper())
BASE_CURRENCY_NAME = os.environ.get("MOOMOO_BASE_CURRENCY", "SGD").upper()
BASE_CURRENCY = getattr(Currency, BASE_CURRENCY_NAME)


def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def portfolio():
    context = OpenSecTradeContext(
        filter_trdmarket=TRADE_MARKET,
        host=OPEND_HOST,
        port=OPEND_PORT,
        security_firm=SECURITY_FIRM,
    )
    try:
        query_args = {"trd_env": TrdEnv.REAL, "currency": BASE_CURRENCY}
        if ACCOUNT_ID:
            query_args["acc_id"] = ACCOUNT_ID

        funds_ret, funds = context.accinfo_query(**query_args)
        positions_ret, positions = context.position_list_query(**query_args)
        if funds_ret != RET_OK:
            raise RuntimeError(f"Moomoo funds query failed: {funds}")
        if positions_ret != RET_OK:
            raise RuntimeError(f"Moomoo positions query failed: {positions}")

        fund_row = funds.iloc[0].to_dict() if not funds.empty else {}
        base_total = safe_float(fund_row.get("total_assets"))
        currencies = {str(value).upper() for value in positions.get("currency", []) if value}
        exchange_rates = {BASE_CURRENCY_NAME: 1.0}
        for currency_name in currencies | {"USD"}:
            if currency_name == BASE_CURRENCY_NAME or not hasattr(Currency, currency_name):
                continue
            currency_args = {**query_args, "currency": getattr(Currency, currency_name)}
            currency_ret, currency_funds = context.accinfo_query(**currency_args)
            if currency_ret == RET_OK and not currency_funds.empty:
                currency_total = safe_float(currency_funds.iloc[0].get("total_assets"))
                if base_total and currency_total:
                    exchange_rates[currency_name] = base_total / currency_total

        normalized = []
        for _, row in positions.iterrows():
            symbol = str(row.get("code", ""))
            source_currency = str(row.get("currency", BASE_CURRENCY_NAME)).upper()
            exchange_rate = exchange_rates.get(source_currency, 1.0)
            market_value_native = safe_float(row.get("market_val"))
            pnl_native = safe_float(row.get("pl_val", row.get("unrealized_pl", 0)))
            quantity = safe_float(row.get("qty"))
            normalized.append({
                "externalPositionId": symbol,
                "symbol": symbol.split(".")[-1],
                "name": str(row.get("stock_name", symbol)),
                "type": "Equity",
                "currency": source_currency,
                "marketValueNative": market_value_native,
                "marketValue": market_value_native * exchange_rate,
                "quantity": quantity,
                "averageCost": safe_float(row.get("cost_price")),
                "currentPrice": safe_float(row.get("nominal_price"), market_value_native / quantity if quantity else 0),
                "pnlNative": pnl_native,
                "pnl": pnl_native * exchange_rate,
                "pnlPct": safe_float(row.get("pl_ratio", row.get("pl_ratio_avg_cost", 0))),
            })

        cash_fields = ("cash", "avl_withdrawal_cash", "us_cash")
        cash = next((safe_float(fund_row.get(key)) for key in cash_fields if fund_row.get(key) is not None), 0.0)
        total = safe_float(fund_row.get("total_assets"), sum(item["marketValue"] for item in normalized) + cash)
        as_of = int(time.time() * 1000)
        return {
            "asOf": as_of,
            "total": total,
            "cash": cash,
            "currency": BASE_CURRENCY_NAME,
            "usdToBase": exchange_rates.get("USD", 1.0),
            "cashBalances": [{"currency": BASE_CURRENCY_NAME, "amount": cash}],
            "fxRates": [
                {"base": currency, "quote": BASE_CURRENCY_NAME, "rate": rate, "source": "MOOMOO_ACCOUNT_CONVERSION"}
                for currency, rate in exchange_rates.items() if currency != BASE_CURRENCY_NAME
            ],
            "positions": normalized,
        }
    finally:
        context.close()


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True})
            return
        if self.path != "/portfolio":
            self.send_json(404, {"error": "Not found"})
            return
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if BRIDGE_TOKEN and not hmac.compare_digest(supplied, BRIDGE_TOKEN):
            self.send_json(401, {"error": "Unauthorized"})
            return
        try:
            self.send_json(200, portfolio())
        except Exception as error:
            self.send_json(502, {"error": str(error)})

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    if not BRIDGE_TOKEN and BRIDGE_HOST not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("Set MOOMOO_BRIDGE_TOKEN before exposing the bridge beyond localhost.")
    print(f"Moomoo read-only bridge listening on http://{BRIDGE_HOST}:{BRIDGE_PORT}")
    ThreadingHTTPServer((BRIDGE_HOST, BRIDGE_PORT), Handler).serve_forever()
