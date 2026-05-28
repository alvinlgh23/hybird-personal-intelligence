import { safeFetchJson } from "../utils/fetch.js";

const YAHOO_SYMBOLS = {
  sp500: "%5EGSPC",
  nasdaq: "%5EIXIC",
  dxy: "DX-Y.NYB",
  us10y: "%5ETNX",
};

export const DEFAULT_IMPORTANT_TICKERS = ["NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "META", "TSLA", "PLTR", "MU", "TSM", "AMD", "AVGO", "CRM", "SNOW"];

export async function getMarketSnapshot() {
  const [crypto, globalCrypto, sp500, nasdaq, dxy, us10y] = await Promise.all([
    fetchCryptoPrices(),
    fetchCryptoGlobal(),
    fetchYahooQuote(YAHOO_SYMBOLS.sp500, "S&P 500"),
    fetchYahooQuote(YAHOO_SYMBOLS.nasdaq, "Nasdaq"),
    fetchYahooQuote(YAHOO_SYMBOLS.dxy, "DXY"),
    fetchYahooQuote(YAHOO_SYMBOLS.us10y, "US10Y"),
  ]);

  return {
    timestamp: new Date().toISOString(),
    crypto: {
      btc: crypto.btc,
      eth: crypto.eth,
      btcDominance: globalCrypto.btcDominance,
    },
    macro: {
      sp500,
      nasdaq,
      dxy,
      us10y,
    },
  };
}

export async function getQuotes(symbols) {
  const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()).filter(Boolean))];
  return Promise.all(unique.map((symbol) => fetchYahooQuote(symbol, symbol)));
}

async function fetchCryptoPrices() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
  const data = await safeFetchJson(url);

  return {
    btc: coinFromCoingecko(data?.bitcoin),
    eth: coinFromCoingecko(data?.ethereum),
  };
}

async function fetchCryptoGlobal() {
  const data = await safeFetchJson("https://api.coingecko.com/api/v3/global");
  const value = data?.data?.market_cap_percentage?.btc;
  return {
    btcDominance: Number.isFinite(value) ? value : null,
  };
}

export async function fetchYahooQuote(symbol, label = symbol) {
  const data = await safeFetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2d&interval=1d`);
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite);
  const current = Number.isFinite(meta?.regularMarketPrice) ? meta.regularMarketPrice : closes.at(-1);
  const previous = Number.isFinite(meta?.chartPreviousClose) ? meta.chartPreviousClose : closes.at(-2);

  if (!Number.isFinite(current)) return null;

  return {
    label,
    symbol: decodeURIComponent(symbol),
    price: current,
    changePct: Number.isFinite(previous) && previous !== 0 ? ((current - previous) / previous) * 100 : null,
  };
}

export function inferMarketRegime(snapshot) {
  const nasdaq = snapshot.macro.nasdaq?.changePct;
  const sp500 = snapshot.macro.sp500?.changePct;
  const dxy = snapshot.macro.dxy?.changePct;
  const us10y = snapshot.macro.us10y?.changePct;
  const btc = snapshot.crypto.btc?.changePct;
  const eth = snapshot.crypto.eth?.changePct;

  const equityScore = scorePositive(nasdaq) + scorePositive(sp500);
  const cryptoScore = scorePositive(btc) + scorePositive(eth);
  const pressureScore = scorePositive(dxy) + scorePositive(us10y);
  const net = equityScore + cryptoScore - pressureScore;

  return {
    riskTone: net >= 2 ? "risk-on" : net <= -2 ? "risk-off" : "mixed",
    liquidity: pressureScore >= 2 ? "tightening pressure" : pressureScore <= -1 ? "easier backdrop" : "neutral",
    cryptoSentiment: cryptoScore >= 2 ? "constructive" : cryptoScore <= -2 ? "weak" : "mixed",
    macroPolicy: pressureScore >= 2 ? "tightening" : pressureScore <= -1 ? "easing" : "neutral",
    policy: pressureScore >= 2 ? "tightening" : pressureScore <= -1 ? "easing" : "neutral",
    macroSentiment:
      net >= 2
        ? "growth assets have support, but watch dollar and yields"
        : net <= -2
          ? "defensive tone as liquidity pressure weighs on beta"
          : "cross-currents; wait for confirmation from equities, DXY, and yields",
    risks: [
      pressureScore > 0 ? "Dollar/yield pressure can weigh on long-duration assets" : "Dollar/yield reversal could change the tone quickly",
      equityScore < 1 ? "Equity breadth and mega-cap leadership need confirmation" : "Crowded AI/mega-cap positioning raises reversal risk",
      cryptoScore < 1 ? "Crypto beta remains fragile" : "Crypto strength may fade if liquidity tightens",
    ],
  };
}

function scorePositive(value) {
  if (!Number.isFinite(value)) return 0;
  if (value > 0.25) return 1;
  if (value < -0.25) return -1;
  return 0;
}

function coinFromCoingecko(value) {
  if (!value || !Number.isFinite(value.usd)) return null;
  return {
    price: value.usd,
    changePct: Number.isFinite(value.usd_24h_change) ? value.usd_24h_change : null,
  };
}
