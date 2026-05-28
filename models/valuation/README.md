# Valuation Model Adapter

This folder is the Railway-deployable home for the valuation model.

Expected CLI:

```sh
python3 models/valuation/model.py --ticker PLTR --mode value
python3 models/valuation/model.py --ticker PLTR --mode chase
python3 models/valuation/model.py --ticker PLTR --mode full
```

You can replace `model.py` with your existing Market Valuation Engine as long as it supports the CLI above. If it does not, keep `runner.py` and configure:

```env
VALUATION_MODEL_PATH=models/valuation/runner.py
PYTHON_BIN=python3
MODEL_RUNNER_MODE=cloud
```

The Node service calls `runner.py`, which safely invokes the configured model path with array arguments and returns stdout/stderr to Telegram.
