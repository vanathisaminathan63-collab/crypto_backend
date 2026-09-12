const { WebSocket: BinanceSocket, WebSocketServer } = require('ws');
const { TRACKED_SYMBOLS } = require('../services/coins.service');

const WS_PATH = '/ws/live';
const BINANCE_STREAM_BASE = 'wss://stream.binance.com:9443';
const HEARTBEAT_INTERVAL_MS = 30000;
const RECONNECT_DELAY_MS = 5000;

const send = (ws, payload) => {
  if (ws.readyState === BinanceSocket.OPEN) ws.send(JSON.stringify(payload));
};

const normalizeSymbol = (value) => String(value).trim().toUpperCase();

const buildBinanceUrl = (symbols) => {
  const streams = symbols.map((s) => `${s.toLowerCase()}@ticker`).join('/');
  return `${BINANCE_STREAM_BASE}/stream?streams=${streams}`;
};

const parseTicker = (raw) => {
  const data = raw && raw.data ? raw.data : raw || {};
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    type: 'ticker',
    symbol: data.s || null,
    price: toNum(data.c),
    priceChangePercent: toNum(data.P),
    high24h: toNum(data.h),
    low24h: toNum(data.l),
    volume24h: toNum(data.v),
    quoteVolume24h: toNum(data.q),
    timestamp: toNum(data.E) || Date.now(),
  };
};

const createLiveWebSocket = (server, options = {}) => {
  const symbols = [...(options.symbols || TRACKED_SYMBOLS)].map(normalizeSymbol);
  const allowOrigin = options.allowOrigin || (() => true);

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  let binanceSocket = null;
  let reconnectTimer = null;
  let intentionalClose = false;

  const connectBinance = () => {
    if (intentionalClose) return;
    if (binanceSocket) {
      try { binanceSocket.terminate(); } catch (_e) { /* noop */ }
      binanceSocket = null;
    }

    if (symbols.length === 0) {
      console.warn('[liveWs] No symbols to subscribe to; skipping Binance connection');
      return;
    }

    console.log(`[liveWs] Connecting to Binance stream for ${symbols.length} symbol(s)...`);
    const url = buildBinanceUrl(symbols);
    const socket = new BinanceSocket(url);

    socket.on('open', () => {
      console.log(`[liveWs] Binance WebSocket connected (${symbols.join(', ')})`);
    });

    socket.on('message', (raw) => {
      if (wss.clients.size === 0) return;
      let message;
      try {
        message = parseTicker(JSON.parse(raw.toString()));
      } catch (err) {
        console.error('[liveWs] Failed to parse Binance message:', err?.message || err);
        return;
      }
      if (!message.symbol) return;
      const payload = JSON.stringify(message);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocketServer.OPEN) client.send(payload);
      });
    });

    socket.on('close', () => {
      console.warn('[liveWs] Binance WebSocket closed; reconnecting...');
      if (binanceSocket === socket) binanceSocket = null;
      if (!intentionalClose) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectBinance, RECONNECT_DELAY_MS);
      }
    });

    socket.on('error', (err) => {
      console.error('[liveWs] Binance WebSocket error:', err?.message || err);
    });

    binanceSocket = socket;
  };

  const start = () => {
    clearTimeout(reconnectTimer);
    connectBinance();
  };

  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname !== WS_PATH) return;

    if (!allowOrigin(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    send(ws, {
      type: 'welcome',
      endpoint: WS_PATH,
      message: 'Live market WebSocket connected',
      symbols,
    });

    ws.on('error', (err) => {
      console.error('[liveWs] client error:', err?.message || err);
    });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  const close = async () => {
    intentionalClose = true;
    clearTimeout(reconnectTimer);
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.close(1001, 'Server shutting down');
    if (binanceSocket) {
      try { binanceSocket.terminate(); } catch (_e) { /* noop */ }
      binanceSocket = null;
    }
    wss.close();
  };

  start();

  return {
    wss,
    getStatus: () => ({
      path: WS_PATH,
      clients: wss.clients.size,
      symbols,
      binanceConnected: Boolean(binanceSocket && binanceSocket.readyState === BinanceSocket.OPEN),
    }),
    close,
  };
};

module.exports = { createLiveWebSocket, WS_PATH };