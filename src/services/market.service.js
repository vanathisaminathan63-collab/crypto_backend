const {
  NetworkError,
  TooManyRequestsError,
  RateLimitBanError,
  ServerError,
  BadRequestError,
  NotFoundError,
} = require('@binance/spot');
const binanceClient = require('../config/binance');

const binanceError = (err) => {
  if (err instanceof NetworkError) {
    const error = new Error(err.message || 'Binance network error');
    error.statusCode = 502;
    error.code = 'BINANCE_NETWORK_ERROR';
    return error;
  }
  if (err instanceof TooManyRequestsError || err instanceof RateLimitBanError) {
    const error = new Error(err.message || 'Binance rate limit reached');
    error.statusCode = 429;
    error.code = 'BINANCE_RATE_LIMIT';
    return error;
  }
  if (err instanceof ServerError) {
    const error = new Error(err.message || 'Binance server error');
    error.statusCode = err.statusCode || 500;
    error.code = 'BINANCE_SERVER_ERROR';
    return error;
  }
  if (err instanceof BadRequestError) {
    const error = new Error(err.message || 'Invalid request to Binance');
    error.statusCode = 400;
    error.code = 'BINANCE_BAD_REQUEST';
    return error;
  }
  if (err instanceof NotFoundError) {
    const error = new Error(err.message || 'Binance resource not found');
    error.statusCode = 404;
    error.code = 'BINANCE_NOT_FOUND';
    return error;
  }
  return err;
};

const getTickerPrice = async ({ symbol, symbols } = {}) => {
  const params = symbols ? { symbols } : { symbol };
  try {
    const response = await binanceClient.restAPI.tickerPrice(params);
    return response.data();
  } catch (err) {
    throw binanceError(err);
  }
};

const TICKER_BATCH_SIZE = 100;
const SYMBOL_CACHE_TTL_MS = 60 * 60 * 1000;

const quoteSymbolCache = new Map();

const getQuoteSymbols = async (quote) => {
  const cached = quoteSymbolCache.get(quote);
  if (cached && cached.expiresAt > Date.now()) return cached.symbols;

  const response = await binanceClient.restAPI.exchangeInfo();
  const { symbols } = await response.data();
  const list = (symbols || [])
    .filter(
      (item) =>
        item.quoteAsset === quote &&
        item.status === 'TRADING' &&
        item.isSpotTradingAllowed !== false
    )
    .map((item) => item.symbol);

  quoteSymbolCache.set(quote, {
    symbols: list,
    expiresAt: Date.now() + SYMBOL_CACHE_TTL_MS,
  });
  return list;
};

const fetchTickersForSymbols = async (symbols) => {
  const batches = [];
  for (let i = 0; i < symbols.length; i += TICKER_BATCH_SIZE) {
    batches.push(symbols.slice(i, i + TICKER_BATCH_SIZE));
  }
  const results = await Promise.all(
    batches.map((batch) =>
      binanceClient.restAPI
        .ticker24hr({ symbols: batch })
        .then((response) => response.data())
    )
  );
  return results.flat();
};

const getTickersByQuote = async (quote) => {
  let symbols = await getQuoteSymbols(quote);
  try {
    return await fetchTickersForSymbols(symbols);
  } catch (err) {
    // A cached symbol may have been delisted, failing the whole batch.
    // Refresh the symbol list once and retry before surfacing the error.
    quoteSymbolCache.delete(quote);
    symbols = await getQuoteSymbols(quote);
    return fetchTickersForSymbols(symbols);
  }
};

const getTicker24hr = async ({ symbol, symbols, type, quote } = {}) => {
  if (symbol || symbols) {
    const params = symbols ? { symbols } : { symbol };
    try {
      const response = await binanceClient.restAPI.ticker24hr(params);
      return response.data();
    } catch (err) {
      throw binanceError(err);
    }
  }

  if (quote) {
    try {
      return await getTickersByQuote(quote);
    } catch (err) {
      throw binanceError(err);
    }
  }

  try {
    const response = await binanceClient.restAPI.ticker24hr({ type });
    return response.data();
  } catch (err) {
    throw binanceError(err);
  }
};

const getKlines = async ({ symbol, interval, startTime, endTime, limit } = {}) => {
  try {
    const response = await binanceClient.restAPI.klines({
      symbol,
      interval,
      startTime,
      endTime,
      limit,
    });
    return response.data();
  } catch (err) {
    throw binanceError(err);
  }
};

const getOrderBook = async ({ symbol, limit } = {}) => {
  try {
    const response = await binanceClient.restAPI.depth({ symbol, limit });
    return response.data();
  } catch (err) {
    throw binanceError(err);
  }
};

const getAvgPrice = async ({ symbol } = {}) => {
  try {
    const response = await binanceClient.restAPI.avgPrice({ symbol });
    return response.data();
  } catch (err) {
    throw binanceError(err);
  }
};

const getRecentTrades = async ({ symbol, limit } = {}) => {
  try {
    const response = await binanceClient.restAPI.getTrades({ symbol, limit });
    return response.data();
  } catch (err) {
    throw binanceError(err);
  }
};

const getSymbols = async () => {
  try {
    const response = await binanceClient.restAPI.exchangeInfo();
    const { symbols } = await response.data();
    return (symbols || [])
      .filter(
        (item) => item.status === 'TRADING' && item.isSpotTradingAllowed !== false
      )
      .map((item) => ({
        symbol: item.symbol,
        baseAsset: item.baseAsset,
        quoteAsset: item.quoteAsset,
      }));
  } catch (err) {
    throw binanceError(err);
  }
};

module.exports = {
  getTickerPrice,
  getTicker24hr,
  getKlines,
  getOrderBook,
  getAvgPrice,
  getRecentTrades,
  getSymbols,
};
