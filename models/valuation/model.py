#!/usr/bin/env python3
"""Fallback valuation model with a small CLI.

Replace this file with your existing Market Valuation Engine when ready.
The CLI contract should remain:
  --ticker <TICKER>
  --mode value | chase | full
"""

from __future__ import annotations

import argparse
import json
import math
from typing import Any

import yfinance as yf


def fetch_info(ticker: str) -> dict[str, Any]:
    stock = yf.Ticker(ticker)
    hist = stock.history(period="1y")
    info = stock.info or {}
    price = float(info.get("regularMarketPrice") or (hist["Close"].iloc[-1] if not hist.empty else float("nan")))
    ma200 = float(hist["Close"].tail(200).mean()) if len(hist) >= 200 else float("nan")
    change_3m = None
    if len(hist) >= 63:
      old = float(hist["Close"].iloc[-63])
      change_3m = ((price - old) / old) * 100 if old else None
    return {"info": info, "price": price, "ma200": ma200, "change_3m": change_3m}


def value_mode(ticker: str) -> dict[str, Any]:
    data = fetch_info(ticker)
    info = data["info"]
    price = data["price"]
    forward_pe = info.get("forwardPE")
    trailing_pe = info.get("trailingPE")
    revenue_growth = info.get("revenueGrowth")
    fair_value = None
    if isinstance(forward_pe, (int, float)) and forward_pe > 0:
        # Simple fallback heuristic, not a replacement for your real engine.
        target_multiple = 24 if (revenue_growth or 0) > 0.1 else 18
        fair_value = price * (target_multiple / forward_pe)
    upside = ((fair_value - price) / price) * 100 if fair_value and price else None
    return {
        "ticker": ticker,
        "mode": "value",
        "current_price": round(price, 2) if math.isfinite(price) else None,
        "fair_value_estimate": round(fair_value, 2) if fair_value else None,
        "upside_downside_pct": round(upside, 2) if upside is not None else None,
        "forward_pe": forward_pe,
        "trailing_pe": trailing_pe,
        "revenue_growth": revenue_growth,
        "assumptions": "Fallback heuristic using forward P/E and growth; replace with your full valuation engine.",
    }


def chase_mode(ticker: str) -> dict[str, Any]:
    data = fetch_info(ticker)
    price = data["price"]
    ma200 = data["ma200"]
    vs_ma200 = ((price - ma200) / ma200) * 100 if math.isfinite(price) and math.isfinite(ma200) and ma200 else None
    momentum = data["change_3m"]
    warning = "low"
    if (vs_ma200 or 0) > 35 or (momentum or 0) > 45:
        warning = "high"
    elif (vs_ma200 or 0) > 15 or (momentum or 0) > 20:
        warning = "medium"
    return {
        "ticker": ticker,
        "mode": "chase",
        "current_price": round(price, 2) if math.isfinite(price) else None,
        "momentum_3m_pct": round(momentum, 2) if momentum is not None else None,
        "price_vs_200ma_pct": round(vs_ma200, 2) if vs_ma200 is not None else None,
        "valuation_heat": warning,
        "warning_level": warning,
        "fomo_chase_risk": warning in {"medium", "high"},
    }


def run(ticker: str, mode: str) -> dict[str, Any]:
    if mode == "value":
        return value_mode(ticker)
    if mode == "chase":
        return chase_mode(ticker)
    return {"ticker": ticker, "mode": "full", "valuation": value_mode(ticker), "chase": chase_mode(ticker)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", required=True)
    parser.add_argument("--mode", choices=["value", "chase", "full"], default="value")
    args = parser.parse_args()
    print(json.dumps(run(args.ticker.upper(), args.mode), indent=2))


if __name__ == "__main__":
    main()
