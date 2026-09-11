const cmcService = require('../services/cmc.service');

const DEFAULT_CONVERT = 'USD';

const parsePositiveInt = (value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER, label } = {}) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    const err = new Error(
      `Query parameter "${label}" must be an integer between ${min} and ${max}`
    );
    err.statusCode = 400;
    err.code = 'INVALID_PARAMETER';
    throw err;
  }
  return parsed;
};

const normalizeConvert = (convert) => {
  const value = (convert || DEFAULT_CONVERT).trim().toUpperCase();
  if (!/^[A-Z0-9:]{3,20}$/.test(value)) {
    const err = new Error('Query parameter "convert" is not a valid currency code');
    err.statusCode = 400;
    err.code = 'INVALID_PARAMETER';
    throw err;
  }
  return value;
};

const researchCoins = async (req, res) => {
  const start = parsePositiveInt(req.query.start, 1, { label: 'start' });
  const limit = parsePositiveInt(req.query.limit, 100, { min: 1, max: 5000, label: 'limit' });
  const convert = normalizeConvert(req.query.convert);

  const data = await cmcService.getCoins({ start, limit, convert });

  res.status(200).json({ success: true, data, message: 'Research coins fetched' });
};

const coinDetail = async (req, res) => {
  const symbol = (req.params.symbol || '').trim().toUpperCase();
  const convert = normalizeConvert(req.query.convert);

  const data = await cmcService.getCoinDetail({ symbol, convert });

  res.status(200).json({ success: true, data, message: `Research data for ${symbol} fetched` });
};

const globalStats = async (req, res) => {
  const convert = normalizeConvert(req.query.convert);

  const data = await cmcService.getGlobalStats({ convert });

  res.status(200).json({ success: true, data, message: 'Global market stats fetched' });
};

module.exports = {
  researchCoins,
  coinDetail,
  globalStats,
};