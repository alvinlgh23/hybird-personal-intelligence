#!/usr/bin/env python3
"""Safe CLI adapter for the valuation model.

Contract:
  python3 models/valuation/runner.py --ticker PLTR --mode value
  python3 models/valuation/runner.py --ticker MU --mode chase
  python3 models/valuation/runner.py --ticker NVDA --mode full

The adapter first imports model.py and calls known functions when present.
If that is not possible, it falls back to executing model.py safely.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import traceback
from typing import Any

TICKER_RE = re.compile(r"^[A-Z.-]{1,10}$")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", required=True)
    parser.add_argument("--mode", choices=["value", "chase", "full"], default="value")
    parser.add_argument("--model", default=os.path.join(os.path.dirname(__file__), "model.py"))
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()

    ticker = args.ticker.upper()
    warnings: list[str] = []
    if not TICKER_RE.fullmatch(ticker):
        emit(ticker, args.mode, "", {}, ["Invalid ticker."])
        return 2

    model_path = os.path.abspath(args.model)
    if not os.path.exists(model_path):
        emit(ticker, args.mode, "", {}, ["Valuation model file not found."])
        return 3

    try:
        data = call_imported_model(model_path, ticker, args.mode)
        emit(ticker, args.mode, summary_for(args.mode, data), data, warnings)
        return 0
    except Exception as exc:
        warnings.append(f"Import adapter failed: {short_error(exc)}")

    try:
        raw = call_script_model(model_path, ticker, args.mode, args.timeout)
        parsed = parse_json(raw)
        data = parsed if parsed is not None else {"raw_output": raw}
        emit(ticker, args.mode, summary_for(args.mode, data), data, warnings)
        return 0
    except Exception as exc:
        warnings.append(f"Script adapter failed: {short_error(exc)}")
        emit(ticker, args.mode, "Valuation model failed.", {}, warnings)
        return 1


def call_imported_model(model_path: str, ticker: str, mode: str) -> dict[str, Any]:
    module = load_module(model_path)

    if hasattr(module, "run"):
        result = module.run(ticker, mode)
    elif mode == "value" and hasattr(module, "value_mode"):
        result = module.value_mode(ticker)
    elif mode == "chase" and hasattr(module, "chase_mode"):
        result = module.chase_mode(ticker)
    elif mode == "full" and hasattr(module, "value_mode") and hasattr(module, "chase_mode"):
        result = {"valuation": module.value_mode(ticker), "chase": module.chase_mode(ticker)}
    else:
        raise RuntimeError("No supported callable found in model.py.")

    if isinstance(result, dict):
        return result
    return {"raw_output": str(result)}


def call_script_model(model_path: str, ticker: str, mode: str, timeout: int) -> str:
    commands = [
        [sys.executable, model_path, "--ticker", ticker, "--mode", mode],
        [sys.executable, model_path, ticker],
    ]
    last_error = ""
    for cmd in commands:
        completed = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
        if completed.returncode == 0 and completed.stdout.strip():
            return completed.stdout.strip()
        last_error = (completed.stderr or completed.stdout or "").strip()
    raise RuntimeError(last_error or "model.py returned no output")


def load_module(model_path: str):
    spec = importlib.util.spec_from_file_location("valuation_model", model_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load model.py.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def emit(ticker: str, mode: str, summary: str, data: dict[str, Any], warnings: list[str]) -> None:
    print(
        json.dumps(
            {
                "ticker": ticker,
                "mode": mode,
                "summary": summary,
                "data": data,
                "warnings": warnings,
            },
            indent=2,
            default=str,
        )
    )


def summary_for(mode: str, data: dict[str, Any]) -> str:
    if "summary" in data:
        return str(data["summary"])
    if mode == "value":
        fair_value = data.get("fair_value_estimate") or data.get("fair_value")
        upside = data.get("upside_downside_pct")
        return f"Valuation output generated. Fair value: {fair_value or 'n/a'}, upside/downside: {upside or 'n/a'}."
    if mode == "chase":
        warning = data.get("warning_level") or data.get("valuation_heat")
        return f"Chase-risk output generated. Warning level: {warning or 'n/a'}."
    return "Full valuation and chase-risk output generated."


def parse_json(value: str):
    try:
        return json.loads(value)
    except Exception:
        return None


def short_error(exc: BaseException) -> str:
    text = str(exc) or exc.__class__.__name__
    if os.environ.get("VALUATION_DEBUG") == "true":
        text = traceback.format_exc(limit=2)
    return text.splitlines()[0][:240]


if __name__ == "__main__":
    raise SystemExit(main())
