# Hybrid Financial + Personal Intelligence OS

Telegram AI assistant for Gmail summaries, market intelligence, earnings, macro/crypto signals, watchlists, daily digests, and local-only Codex/Chrome automation.

It supports two runtime modes:

- **Cloud mode** for Railway 24/7 hosting.
- **Local mode** for your MacBook, Codex CLI, Chrome diagnostics, and local Python valuation models.

No large frameworks are used. The app is Node.js ESM, the Gmail integration uses the official Google Gmail API client, and market/news layers use lightweight fetch/RSS calls.

## Commands

Cloud-safe:

- `/health`
- `/gmail`
- `/gmail_status`
- `/gmail_reconnect`
- `/gmail_auth`
- `/gmail_code <code-or-url>`
- `/gmail_export_token`
- `/digest`
- `/morning`
- `/brief`
- `/market`
- `/macro`
- `/eth`
- `/news`
- `/earnings`
- `/earnings <ticker>`
- `/watchlist`
- `/watchlist add <ticker>`
- `/watchlist remove <ticker>`
- `/watchlist brief`
- `/ask_market <question>`

Local-only:

- `/chrome`
- `/agent <task>`
- `/ask_codex <prompt>`
- `/value <ticker>`
- `/chase <ticker>`
- `/analyze <ticker>`

In cloud mode, local-only commands reply:

```text
This command is local-only. Run your Mac local agent.
```

Valuation commands may run in cloud only if `MODEL_RUNNER_MODE=cloud` and the configured model file exists.

## Required Environment

Railway cloud:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=
GEMINI_API_KEY=
AGENT_MODE=cloud
TELEGRAM_MODE=webhook
PUBLIC_URL=https://your-app.up.railway.app
PORT=3000

GEMINI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=
OPENAI_MODEL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_OAUTH_TOKEN_JSON=

DAILY_DIGEST_ENABLED=true
DAILY_DIGEST_TIME=08:00
DAILY_MARKET_DIGEST_ENABLED=true
MARKET_DIGEST_TIME=08:30
TIMEZONE=America/New_York

NEWS_RSS_FEEDS=
WATCHLIST=NVDA,MSFT,AAPL,AMZN,GOOGL,META,TSLA

MODEL_RUNNER_MODE=disabled
VALUATION_MODEL_PATH=models/valuation/runner.py
PYTHON_BIN=python3
VALUATION_TIMEOUT_MS=30000
WATCHLIST_VALUATION_ENABLED=true
```

Local Mac:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=
AGENT_MODE=local
TELEGRAM_MODE=polling

ENABLE_CODEX_EXEC=false
CODEX_WORKSPACE=/Users/alvinlim/Desktop/Startup-Insight-AI/Automation
CODEX_TIMEOUT_MS=120000

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=
OPENAI_MODEL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GMAIL_TOKEN_PATH=.tokens/gmail-token.json
ALLOW_TOKEN_EXPORT=false

MODEL_RUNNER_MODE=local
VALUATION_MODEL_PATH=models/valuation/runner.py
PYTHON_BIN=python3
VALUATION_TIMEOUT_MS=30000
```

## Local Run

```sh
cd /Users/alvinlim/Documents/Automation
npm install
AGENT_MODE=local TELEGRAM_MODE=polling npm start
```

Then test:

```text
/health
/gmail
/gmail_status
/digest
/market
/news
/earnings
/watchlist brief
/morning
/chrome
```

## Railway Cloud Run

1. Push this repo to GitHub.
2. Create a Railway project from the GitHub repo.
3. Add the Railway environment variables above.
4. Set:

   ```env
   AGENT_MODE=cloud
   TELEGRAM_MODE=webhook
   PUBLIC_URL=https://your-app.up.railway.app
   ```

5. Deploy.
6. On startup, the app calls Telegram `setWebhook` for:

   ```text
   ${PUBLIC_URL}/telegram/webhook
   ```

7. Check:

   ```text
   GET /health
   ```

Telegram test commands:

```text
/health
/gmail
/digest
/market
/news
/earnings
/watchlist brief
/morning
```

## Gmail OAuth

This project uses the official Gmail API with read-only scope:

```text
https://www.googleapis.com/auth/gmail.readonly
```

Google Cloud setup:

1. Open Google Cloud Console.
2. Create or select a project.
3. Enable **Gmail API**.
4. Configure the OAuth consent screen.
5. Add yourself as a test user if the app is in testing mode.
6. Create OAuth credentials.
7. Add authorized redirect URI:

   ```text
   http://localhost:3000/oauth2callback
   ```

8. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `.env`.
9. Start local mode and send:

   ```text
   /gmail_auth
   ```

10. Open the link, approve access, and send back:

   ```text
   /gmail_code <code-or-full-redirect-url>
   ```

## Railway Gmail Setup

Railway cannot read your Mac's `.tokens/gmail-token.json`, so cloud Gmail uses `GOOGLE_OAUTH_TOKEN_JSON`.

Token loading priority:

1. `GOOGLE_OAUTH_TOKEN_JSON` environment variable.
2. Local `GMAIL_TOKEN_PATH` file for Mac development.
3. Gmail disabled gracefully.

If Gmail is disabled in cloud mode, `/morning` and `/digest` show:

```text
Gmail not connected in cloud mode.
```

To create the Railway token JSON, first make Gmail work locally, then:

1. Set:

   ```env
   ALLOW_TOKEN_EXPORT=true
   ```

2. Restart local bot.
3. Send:

   ```text
   /gmail_export_token
   ```

4. Copy the compact JSON into Railway variable:

   ```env
   GOOGLE_OAUTH_TOKEN_JSON=<copied-json>
   ```

5. Set `ALLOW_TOKEN_EXPORT=false` locally and restart.

Add these Railway variables for Gmail:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_OAUTH_TOKEN_JSON=<copied-json>
```

You can also reconnect from Railway:

1. Send `/gmail_reconnect`.
2. Open the OAuth link and approve read-only Gmail access.
3. Send `/gmail_code <code-or-full-url>`.
4. Copy the returned `GOOGLE_OAUTH_TOKEN_JSON` value into Railway Variables.
5. Redeploy.

Tokens are never logged. The app only logs whether Gmail auth loaded from env, file, or is disabled. `.env`, `.tokens/`, and token JSON files are ignored by git.

## Valuation Model Integration

The deployable valuation model lives here:

```text
models/
  valuation/
    model.py
    runner.py
    requirements.txt
    README.md
```

If you already have a Market Valuation Engine file named `model.py` or `Valuation_model.py`, copy it into:

```text
models/valuation/model.py
```

Keep the CLI contract if possible:

```sh
python3 models/valuation/model.py --ticker PLTR --mode value
python3 models/valuation/model.py --ticker PLTR --mode chase
python3 models/valuation/model.py --ticker PLTR --mode full
```

If your existing model does not support that clean CLI, `models/valuation/runner.py` tries the modern CLI first, then falls back to calling the model with just the ticker. For best output quality, update your Python model to print JSON fields such as `current_price`, `fair_value_estimate`, `upside_downside_pct`, `momentum_3m_pct`, `price_vs_200ma_pct`, and `warning_level`.

Set:

```env
MODEL_RUNNER_MODE=local
VALUATION_MODEL_PATH=models/valuation/runner.py
PYTHON_BIN=python3
VALUATION_TIMEOUT_MS=30000
```

Commands:

```text
/value NVDA
/chase NVDA
/analyze NVDA
```

Railway variables:

Required:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_IDS`
- `GEMINI_API_KEY`

Optional:

- `OPENAI_API_KEY`
- `GEMINI_MODEL` (defaults to `gemini-2.5-flash`)
- `OPENAI_MODEL`

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=
GEMINI_API_KEY=
AGENT_MODE=cloud
TELEGRAM_MODE=webhook
PUBLIC_URL=https://your-app.up.railway.app
GEMINI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=
OPENAI_MODEL=
MODEL_RUNNER_MODE=cloud
VALUATION_MODEL_PATH=models/valuation/runner.py
PYTHON_BIN=python3
VALUATION_TIMEOUT_MS=30000
WATCHLIST_VALUATION_ENABLED=true
```

Python dependencies are installed from:

```text
models/valuation/requirements.txt
```

The root `postinstall` script runs:

```sh
python3 -m pip install -r models/valuation/requirements.txt || true
```

If Railway does not install Python dependencies during `postinstall`, set the Railway build command to:

```sh
npm install && python3 -m pip install -r models/valuation/requirements.txt
```

Security:

- Tickers must match `A-Z`, dot, or hyphen, max 10 characters.
- The app uses `spawn` with array args, not shell execution.
- Cloud mode will not run the local Python model unless `MODEL_RUNNER_MODE=cloud` and the file exists.

Limitations:

- The included `models/valuation/model.py` is a fallback heuristic, not your full valuation engine.
- If your real model prints unstructured text, Telegram will return a concise text block but some fields may show `n/a`.
- For best `/analyze` output, make the Python model print JSON.

## Security

- Telegram allowlist applies to every command except `/whoami`.
- Cloud mode disables `/ask_codex` and `/chrome`.
- Tokens are never printed to logs.
- Gmail is read-only.
- No arbitrary shell execution from Telegram.
- Financial responses use interpretation language, not personalized buy/sell advice.

## Project Structure

```text
src/
  ai/
    marketSummarizer.js
    router.js
    summarizer.js
    providers/
      gemini.js
      openai.js
  bot.js
  commands/
    earnings.js
    gmail.js
    index.js
    market.js
    news.js
    system.js
    valuation.js
    watchlist.js
  schedulers/
    dailyDigest.js
  services/
    chrome.js
    codex.js
    earnings.js
    emailDigest.js
    gmail.js
    localBridge.js
    marketData.js
    marketIntel.js
    morning.js
    news.js
    telegram.js
    valuation.js
    watchlist.js
  utils/
    env.js
    fetch.js
    format.js
    safeJson.js
    time.js
```
