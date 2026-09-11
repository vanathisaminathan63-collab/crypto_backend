const { Spot } = require('@binance/spot');
const env = require('../config/env');

const STREAM_TYPES = ['trade', 'ticker', 'kline'];
const KLINE_INTERVALS = [
  '1s', '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '8h', '12h',
  '1d', '3d', '1w', '1M',
];
const DEFAULT_KLINE_INTERVAL = '1m';

const symbolToStreamToken = (symbol) => String(symbol).toLowerCase();

const buildStreamKey = ({ type, symbol, interval }) => {
  const token = symbolToStreamToken(symbol);
  if (type === 'kline') return `${token}@kline_${interval || DEFAULT_KLINE_INTERVAL}`;
  return `${token}@${type}`;
};

const normalizeSymbol = (value) => {
  if (typeof value !== 'string') throw new Error('Symbol must be a string');
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) throw new Error(`Invalid symbol: ${value}`);
  return symbol;
};

const normalizeKlineInterval = (interval) => {
  if (!KLINE_INTERVALS.includes(interval)) {
    throw new Error(`Invalid kline interval: ${interval}`);
  }
  return interval;
};

const normalizeStreamDescriptor = (input) => {
  const type = String(input.type || '').toLowerCase();
  if (!STREAM_TYPES.includes(type)) {
    throw new Error(`Unsupported stream type: ${input.type}`);
  }
  const symbol = normalizeSymbol(input.symbol);
  if (type === 'kline') {
    const interval = normalizeKlineInterval(input.interval || DEFAULT_KLINE_INTERVAL);
    return { type, symbol, interval };
  }
  return { type, symbol };
};

const createMarketStreamHub = () => {
  let spot;
  let connection = null;
  let connecting = null;
  let closed = false;

  const streams = new Map();

  const ensureConnection = async () => {
    if (closed) throw new Error('Market stream hub is closed');
    if (connection && connection.isConnected()) return connection;
    if (connecting) return connecting;

    connecting = (async () => {
      spot = new Spot({ configurationWebsocketStreams: { mode: 'single', reconnectDelay: 5000 } });
      const initialStreams = [...streams.keys()];
      const conn = await spot.websocketStreams.connect({ stream: initialStreams });
      conn.on('close', () => {
        if (!closed) console.warn('[marketStream] Binance WS closed; SDK will reconnect');
      });
      conn.on('error', (err) => {
        if (!closed) console.error('[marketStream] Binance WS error:', err?.message || err);
      });
      connection = conn;
      return conn;
    })();

    try {
      const conn = await connecting;
      return conn;
    } finally {
      connecting = null;
    }
  };

  const createHandler = async (descriptor, streamKey) => {
    const conn = await ensureConnection();
    const params = { symbol: descriptor.symbol };
    let handler;
    switch (descriptor.type) {
      case 'trade':
        handler = conn.trade(params);
        break;
      case 'ticker':
        handler = conn.ticker(params);
        break;
      case 'kline':
        handler = conn.kline({ ...params, interval: descriptor.interval });
        break;
      default:
        throw new Error(`Unsupported stream type: ${descriptor.type}`);
    }
    return { conn, handler };
  };

  const subscribe = async (descriptor, callback) => {
    const normalized = normalizeStreamDescriptor(descriptor);
    const streamKey = buildStreamKey(normalized);

    const existing = streams.get(streamKey);
    if (existing) {
      existing.callbacks.add(callback);
      return streamKey;
    }

    const { conn, handler } = await createHandler(normalized, streamKey);
    const entry = {
      descriptor: normalized,
      streamKey,
      conn,
      handler,
      callbacks: new Set([callback]),
    };
    handler.on('message', (data) => {
      entry.callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error('[marketStream] stream callback error:', err?.message || err);
        }
      });
    });
    streams.set(streamKey, entry);
    return streamKey;
  };

  const unsubscribe = async (streamKey, callback) => {
    const entry = streams.get(streamKey);
    if (!entry) return false;
    entry.callbacks.delete(callback);
    if (entry.callbacks.size === 0) {
      entry.handler.unsubscribe();
      streams.delete(streamKey);
    }
    return true;
  };

  const unsubscribeAll = async (streamKeys, callback) => {
    const removed = [];
    for (const key of streamKeys) {
      if (await unsubscribe(key, callback)) removed.push(key);
    }
    return removed;
  };

  const activeStreams = () => [...streams.keys()];

  const getStatus = () => ({
    connected: Boolean(connection && connection.isConnected()),
    streamCount: streams.size,
    streams: activeStreams(),
    closed,
  });

  const shutdown = async () => {
    closed = true;
    if (connecting) {
      try { await connecting; } catch (_e) { /* noop */ }
    }
    if (connection) {
      try {
        await connection.disconnect();
      } catch (err) {
        console.error('[marketStream] disconnect error:', err?.message || err);
      }
    }
    connection = null;
    connecting = null;
    streams.clear();
  };

  return {
    subscribe,
    unsubscribe,
    unsubscribeAll,
    activeStreams,
    getStatus,
    shutdown,
  };
};

module.exports = {
  createMarketStreamHub,
  STREAM_TYPES,
  KLINE_INTERVALS,
  DEFAULT_KLINE_INTERVAL,
  normalizeStreamDescriptor,
  buildStreamKey,
};