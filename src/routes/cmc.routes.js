const { Router } = require('express');
const { researchCoins, coinDetail, globalStats } = require('../controllers/cmc.controller');

const router = Router();

router.get('/coins', researchCoins);
router.get('/coins/:symbol', coinDetail);
router.get('/global-stats', globalStats);

module.exports = router;