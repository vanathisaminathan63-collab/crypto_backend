const env = require('../config/env');

const CMC_API_VERSION = '/v1';

const LISTINGS_AUX = [
  'num_market_pairs',
  'cmc_rank',
  'date_added',
  'tags',
  'platform',
  'max_supply',
  'circulating_supply',
  'total_supply',
  'volume_24h_reported',
  'volume_7d',
  'volume_7d_reported',
  'volume_30d',
  'volume_30d_reported',
  'is_market_cap_included_in_calc',
].join(',');

const QUOTES_AUX = [
  'num_market_pairs',
  'cmc_rank',
  'date_added',
  'tags',
  'platform',
  'max_supply',
  'circulating_supply',
  'total_supply',
  'is_active',
  'is_fiat',
].join(',');

const cmcError = (message, statusCode, code) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
};

const normalizeSymbol = (sym) => (sym || '').trim().toUpperCase();

const resolveCmcId = async (symbol) => {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    throw cmcError('Symbol is required', 400, 'CMC_INVALID_SYMBOL');
  }

  if (!/^[0-9A-Za-z$@]+$/.test(normalized)) {
    throw cmcError(
      `No CoinMarketCap data found for symbol "${normalized}"`,
      404,
      'CMC_SYMBOL_NOT_FOUND'
    );
  }

  const data = await cmcRequest('/cryptocurrency/map', {
    symbol: normalized,
    listing_status: 'active',
  });

  const matches = Array.isArray(data) ? data : [];
  const match =
    matches.find((c) => c.symbol === normalized && c.is_active === 1) ||
    matches[0];

  if (!match) {
    throw cmcError(
      `No CoinMarketCap data found for symbol "${normalized}"`,
      404,
      'CMC_SYMBOL_NOT_FOUND'
    );
  }

  return match.id;
};

const cmcRequest = async (path, params = {}) => {
  if (!env.CMC_API_KEY) {
    throw cmcError(
      'CMC_API_KEY is not configured. Add it to .env (or .env.example) to use the research endpoints.',
      503,
      'CMC_API_KEY_MISSING'
    );
  }

  const baseUrl = env.CMC_BASE_URL.replace(/\/+$/, '');
  const url = new URL(`${baseUrl}${CMC_API_VERSION}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  let response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-CMC_PRO_API_KEY': env.CMC_API_KEY,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw cmcError(
      `CoinMarketCap API unreachable: ${err.message}`,
      502,
      'CMC_NETWORK_ERROR'
    );
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || (body && body.status && body.status.error_code !== 0)) {
    const status = body && body.status;
    const message = status && status.error_message
      ? status.error_message
      : `CoinMarketCap API error (HTTP ${response.status})`;
    const code = status && status.error_code
      ? `CMC_${status.error_code}`
      : 'CMC_API_ERROR';
    throw cmcError(message, response.status || 502, code);
  }

  return body.data;
};

const getMetadata = async ({ symbols, ids } = {}) => {
  const params = {};
  if (ids) params.id = ids;
  else if (symbols) params.symbol = symbols;
  const raw = await cmcRequest('/cryptocurrency/info', params);
  return raw || {};
};

const getCoins = async ({ start, limit, convert } = {}) => {
  const data = await cmcRequest('/cryptocurrency/listings/latest', {
    start,
    limit,
    convert,
    aux: LISTINGS_AUX,
  });

  const items = Array.isArray(data) ? data : [];
  const symbols = items.map((coin) => coin.symbol).join(',');
  let metadata = {};
  if (symbols) {
    try {
      metadata = await getMetadata({ symbols });
    } catch (err) {
      console.warn('[cmc] metadata fetch failed, continuing without logos:', err.message);
    }
  }

  return items.map((coin) => shapeListedCoin(coin, metadata[coin.symbol], convert));
};

const getCoinDetail = async ({ symbol: rawSymbol, convert } = {}) => {
  const symbol = normalizeSymbol(rawSymbol);

  const cmcId = await resolveCmcId(symbol);

  const data = await cmcRequest('/cryptocurrency/quotes/latest', {
    id: cmcId,
    convert,
    aux: QUOTES_AUX,
  });

  const raw = data && data[cmcId];
  const coin = raw ? (Array.isArray(raw) ? raw[0] : raw) : null;
  if (!coin) {
    throw cmcError(`No CoinMarketCap data found for symbol "${symbol}"`, 404, 'CMC_SYMBOL_NOT_FOUND');
  }

  let metadata = {};
  try {
    metadata = await getMetadata({ ids: cmcId });
  } catch (err) {
    console.warn('[cmc] metadata fetch failed, continuing without extra details:', err.message);
  }

  const meta = metadata[cmcId] || {};
  const quote = (coin.quote && coin.quote[convert]) || {};

  return {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol,
    slug: coin.slug,
    logo: meta.logo || null,
    description: safeMeta(meta, 'description'),
    category: safeMeta(meta, 'category'),
    tags: coin.tags || meta.tags || [],
    urls: meta.urls || {},
    dateAdded: coin.date_added || null,
    cmcRank: coin.cmc_rank ?? null,
    numMarketPairs: coin.num_market_pairs ?? null,
    platform: coin.platform || meta.platform || null,
    isActive: coin.is_active ?? null,
    isFiat: coin.is_fiat ?? null,
    price: quote.price ?? null,
    marketCap: quote.market_cap ?? null,
    marketCapDominance: quote.market_cap_dominance ?? null,
    fullyDilutedMarketCap: quote.fully_diluted_market_cap ?? null,
    selfReportedMarketCap: quote.self_reported_market_cap ?? null,
    volume24h: quote.volume_24h ?? null,
    volume24hReported: quote.volume_24h_reported ?? null,
    volumeChange24h: quote.volume_change_24h ?? null,
    percentChange1h: quote.percent_change_1h ?? null,
    percentChange24h: quote.percent_change_24h ?? null,
    percentChange7d: quote.percent_change_7d ?? null,
    percentChange30d: quote.percent_change_30d ?? null,
    percentChange60d: quote.percent_change_60d ?? null,
    percentChange90d: quote.percent_change_90d ?? null,
    circulatingSupply: coin.circulating_supply ?? null,
    selfReportedCirculatingSupply: coin.self_reported_circulating_supply ?? null,
    totalSupply: coin.total_supply ?? null,
    maxSupply: coin.max_supply ?? null,
    lastUpdated: quote.last_updated || coin.last_updated || null,
  };
};

const getGlobalStats = async ({ convert } = {}) => {
  const data = await cmcRequest('/global-metrics/quotes/latest', { convert });
  const quote = (data && data.quote && data.quote[convert]) || {};
  const yesterdayCap = quote.total_market_cap_yesterday;

  return {
    activeCryptocurrencies: data.active_cryptocurrencies ?? null,
    activeMarketPairs: data.active_market_pairs ?? null,
    activeExchanges: data.active_exchanges ?? null,
    btcDominance: data.btc_dominance ?? null,
    ethDominance: data.eth_dominance ?? null,
    totalMarketCapUsd: quote.total_market_cap ?? null,
    totalVolume24hUsd: quote.total_volume_24h ?? null,
    totalVolume24hReportedUsd: quote.total_volume_24h_reported ?? null,
    totalMarketCapYesterdayUsd: yesterdayCap ?? null,
    totalVolume24hYesterdayUsd: quote.total_volume_24h_yesterday ?? null,
    marketCapChange24hPercent:
      yesterdayCap && quote.total_market_cap
        ? ((quote.total_market_cap - yesterdayCap) / yesterdayCap) * 100
        : null,
    lastUpdated: data.last_updated || quote.last_updated || null,
  };
};

const safeMeta = (meta, key) => {
  if (meta[key] === undefined || meta[key] === null) return null;
  if (typeof meta[key] === 'string' && meta[key].trim() === '') return null;
  return meta[key];
};

const shapeListedCoin = (coin, meta, convert) => {
  const quote = (coin.quote && coin.quote[convert]) || {};
  return {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol,
    slug: coin.slug,
    logo: meta && meta.logo ? meta.logo : null,
    cmcRank: coin.cmc_rank ?? null,
    numMarketPairs: coin.num_market_pairs ?? null,
    tags: coin.tags || [],
    platform: coin.platform || null,
    dateAdded: coin.date_added || null,
    price: quote.price ?? null,
    marketCap: quote.market_cap ?? null,
    marketCapDominance: quote.market_cap_dominance ?? null,
    fullyDilutedMarketCap: quote.fully_diluted_market_cap ?? null,
    volume24h: quote.volume_24h ?? null,
    volume24hReported: quote.volume_24h_reported ?? null,
    volume7d: quote.volume_7d ?? null,
    volume30d: quote.volume_30d ?? null,
    volumeChange24h: quote.volume_change_24h ?? null,
    percentChange1h: quote.percent_change_1h ?? null,
    percentChange24h: quote.percent_change_24h ?? null,
    percentChange7d: quote.percent_change_7d ?? null,
    marketCapIncludedInCalc: coin.is_market_cap_included_in_calc ?? null,
    circulatingSupply: coin.circulating_supply ?? null,
    totalSupply: coin.total_supply ?? null,
    maxSupply: coin.max_supply ?? null,
    lastUpdated: quote.last_updated || coin.last_updated || null,
  };
};

module.exports = {
  getCoins,
  getCoinDetail,
  getGlobalStats,
  resolveCmcId,
  normalizeSymbol,
};