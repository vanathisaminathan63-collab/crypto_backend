const { Router } = require('express');
const {
  tickerPrice,
  ticker24hr,
  klines,
  orderBook,
  avgPrice,
  recentTrades,
  symbols,
} = require('../controllers/market.controller');

const router = Router();

router.get('/ticker/price', tickerPrice);
router.get('/ticker/24hr', ticker24hr);
router.get('/klines', klines);
router.get('/depth', orderBook);
router.get('/avgPrice', avgPrice);
router.get('/trades/recent', recentTrades);
router.get('/symbols', symbols);

module.exports = router;
