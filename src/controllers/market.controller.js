const marketService = require('../services/market.service');
const { KLINE_INTERVALS } = require('../services/marketStream.service');

const parseSymbolsParam = (symbols) => {
  if (symbols === undefined) return undefined;
  try {
    const parsed = JSON.parse(symbols);
    if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === 'string')) {
      throw new Error('symbols must be a JSON array of strings');
    }
    return parsed;
  } catch (err) {
    const error = new Error(`Query parameter "symbols" must be a valid JSON array of strings`);
    error.statusCode = 400;
    error.code = 'INVALID_PARAMETER';
    throw error;
  }
};

const tickerPrice = async (req, res) => {
  const { symbol, symbols } = req.query;

  if (!symbol && !symbols) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Query parameter "symbol" (or "symbols") is required',
    });
  }

  const data = await marketService.getTickerPrice({
    symbol,
    symbols: parseSymbolsParam(symbols),
  });

  res.status(200).json({ success: true, data, message: 'Ticker price fetched' });
};

const normalizeQuote = (quote) => {
  if (quote === undefined || quote === null || quote === '') return undefined;
  const value = String(quote).trim().toUpperCase();
  if (!/^[A-Z0-9]{2,15}$/.test(value)) {
    const err = new Error('Query parameter "quote" is not a valid asset code');
    err.statusCode = 400;
    err.code = 'INVALID_PARAMETER';
    throw err;
  }
  return value;
};

const ticker24hr = async (req, res) => {
  const { symbol, symbols, type } = req.query;

  const data = await marketService.getTicker24hr({
    symbol,
    symbols: parseSymbolsParam(symbols),
    type,
    quote: normalizeQuote(req.query.quote),
  });

  res.status(200).json({ success: true, data, message: '24hr ticker fetched' });
};

const klines = async (req, res) => {
  const { symbol, interval, startTime, endTime, limit } = req.query;

  if (!symbol || !interval) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Query parameters "symbol" and "interval" are required',
    });
  }

  if (!KLINE_INTERVALS.includes(interval)) {
    return res.status(400).json({
      success: false,
      data: null,
      message: `Query parameter "interval" is invalid. Allowed values: ${KLINE_INTERVALS.join(', ')}`,
      error: { code: 'INVALID_PARAMETER' },
    });
  }

  const data = await marketService.getKlines({
    symbol,
    interval,
    startTime: startTime ? Number(startTime) : undefined,
    endTime: endTime ? Number(endTime) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  res.status(200).json({ success: true, data, message: 'Klines fetched' });
};

const orderBook = async (req, res) => {
  const { symbol, limit } = req.query;

  if (!symbol) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Query parameter "symbol" is required',
    });
  }

  const data = await marketService.getOrderBook({
    symbol,
    limit: limit ? Number(limit) : undefined,
  });

  res.status(200).json({ success: true, data, message: 'Order book fetched' });
};

const avgPrice = async (req, res) => {
  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Query parameter "symbol" is required',
    });
  }

  const data = await marketService.getAvgPrice({ symbol });

  res.status(200).json({ success: true, data, message: 'Average price fetched' });
};

const recentTrades = async (req, res) => {
  const { symbol, limit } = req.query;

  if (!symbol) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Query parameter "symbol" is required',
    });
  }

  const data = await marketService.getRecentTrades({
    symbol,
    limit: limit ? Number(limit) : undefined,
  });

  res.status(200).json({ success: true, data, message: 'Recent trades fetched' });
};

const symbols = async (_req, res) => {
  const data = await marketService.getSymbols();

  res.status(200).json({ success: true, data, message: 'Trading symbols fetched' });
};

module.exports = {
  tickerPrice,
  ticker24hr,
  klines,
  orderBook,
  avgPrice,
  recentTrades,
  symbols,
};
