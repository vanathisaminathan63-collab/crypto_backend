const coinsService = require('../services/coins.service');

const getCoins = async (_req, res) => {
  const data = await coinsService.getTrackedCoins();
  res.status(200).json({ success: true, data, message: 'Tracked coins fetched' });
};

const getCoinBySymbol = async (req, res) => {
  const { symbol } = req.params;

  if (!symbol) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Path parameter "symbol" is required',
    });
  }

  const data = await coinsService.getCoinBySymbol(symbol);
  res.status(200).json({ success: true, data, message: `Market data for ${symbol.toUpperCase()} fetched` });
};

module.exports = { getCoins, getCoinBySymbol };
