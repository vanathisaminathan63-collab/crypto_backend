const { Router } = require('express');
const { getCoins, getCoinBySymbol } = require('../controllers/coins.controller');

const router = Router();

router.get('/coins', getCoins);
router.get('/coins/:symbol', getCoinBySymbol);

module.exports = router;
