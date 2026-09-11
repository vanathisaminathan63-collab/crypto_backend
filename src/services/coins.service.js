const binanceClient = require('../config/binance');

const TRACKED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];

const parseNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const binanceError = (err) => {
  const error = new Error(err.message || 'Binance API error');
  error.statusCode = err.statusCode || 502;
  error.code = 'BINANCE_API_ERROR';
  return error;
};

const fetchTicker24hr = async (symbol) => {
  try {
    const response = await binanceClient.restAPI.ticker24hr({ symbol });
    return response.data();
  } catch (err) {
    throw binanceError(err);
  }
};

const getTrackedCoins = async () => {
  const results = await Promise.allSettled(
    TRACKED_SYMBOLS.map((symbol) => fetchTicker24hr(symbol))
  );

  const coins = [];
  for (let i = 0; i < TRACKED_SYMBOLS.length; i++) {
    const symbol = TRACKED_SYMBOLS[i];
    const result = results[i];

    if (result.status === 'fulfilled' && result.value) {
      const t = result.value;
      coins.push({
        symbol: t.symbol || symbol,
        baseAsset: symbol.replace(/USDT$/, ''),
        quoteAsset: 'USDT',
        price: parseNumber(t.lastPrice),
        priceChangePercent: parseNumber(t.priceChangePercent),
        high24h: parseNumber(t.highPrice),
        low24h: parseNumber(t.lowPrice),
        volume24h: parseNumber(t.volume),
        quoteVolume24h: parseNumber(t.quoteVolume),
      });
    } else {
      console.warn(`[coins] Failed to fetch data for ${symbol}:`, result.reason?.message || result.reason);
      coins.push({
        symbol,
        baseAsset: symbol.replace(/USDT$/, ''),
        quoteAsset: 'USDT',
        price: null,
        priceChangePercent: null,
        high24h: null,
        low24h: null,
        volume24h: null,
        quoteVolume24h: null,
        error: 'Unable to fetch data from Binance',
      });
    }
  }

  return coins;
};

const getCoinBySymbol = async (symbol) => {
  const normalized = symbol.trim().toUpperCase();

  const t = await fetchTicker24hr(normalized);

  return {
    symbol: t.symbol || normalized,
    baseAsset: t.baseAsset || normalized.replace(/USDT$/, ''),
    quoteAsset: t.quoteAsset || 'USDT',
    price: parseNumber(t.lastPrice),
    priceChange: parseNumber(t.priceChange),
    priceChangePercent: parseNumber(t.priceChangePercent),
    weightedAvgPrice: parseNumber(t.weightedAvgPrice),
    high24h: parseNumber(t.highPrice),
    low24h: parseNumber(t.lowPrice),
    openPrice: parseNumber(t.openPrice),
    closePrice: parseNumber(t.lastPrice),
    volume24h: parseNumber(t.volume),
    quoteVolume24h: parseNumber(t.quoteVolume),
    openTime: t.openTime || null,
    closeTime: t.closeTime || null,
    count: t.count || null,
  };
};

module.exports = {
  TRACKED_SYMBOLS,
  getTrackedCoins,
  getCoinBySymbol,
};
