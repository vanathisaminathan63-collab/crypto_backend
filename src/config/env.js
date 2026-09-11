const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  PORT: parseInt(process.env.PORT, 10) || 5000,
  BINANCE_API_KEY: process.env.BINANCE_API_KEY || '',
  BINANCE_API_SECRET: process.env.BINANCE_API_SECRET || '',
  CMC_API_KEY: process.env.CMC_API_KEY || '',
  CMC_BASE_URL: process.env.CMC_BASE_URL || 'https://pro-api.coinmarketcap.com',
  NODE_ENV: process.env.NODE_ENV || 'development',
};

module.exports = env;
