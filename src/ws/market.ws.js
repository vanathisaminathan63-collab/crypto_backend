const { WebSocketServer } = require('ws');
const {
  createMarketStreamHub,
  buildStreamKey,
  normalizeStreamDescriptor,
  DEFAULT_KLINE_INTERVAL,
} = require('../services/marketStream.service');

const WS_PATH = '/ws/market';
const HEARTBEAT_INTERVAL_MS = 30000;

const send = (ws, payload) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
};

const enrichMarketMessage = ({ descriptor, data }) => {
  const message = {
    type: 'market',
    channel: descriptor.type,
    symbol: descriptor.symbol,
    stream: buildStreamKey(descriptor),
    data,
  };
  if (descriptor.type === 'kline') message.interval = descriptor.interval;
  return message;
};

const parsePayload = (raw) => {
  const parsed = JSON.parse(raw);
  const action = parsed.action || parsed.type;
  if (action !== 'subscribe' && action !== 'unsubscribe') {
    throw new Error(`Unsupported action: ${action}`);
  }
  if (parsed.symbols !== undefined && !Array.isArray(parsed.symbols)) {
    throw new Error('"symbols" must be an array of strings');
  }
  if (parsed.streams !== undefined && !Array.isArray(parsed.streams)) {
    throw new Error('"streams" must be an array of descriptors');
  }
  if (!parsed.symbols && !parsed.streams) {
    throw new Error('Provide "symbols" and/or "streams"');
  }
  return parsed;
};

const expandRequest = (parsed) => {
  const descriptors = [];
  for (const symbol of parsed.symbols || []) {
    descriptors.push({ type: 'trade', symbol });
    descriptors.push({ type: 'ticker', symbol });
    descriptors.push({ type: 'kline', symbol, interval: DEFAULT_KLINE_INTERVAL });
  }
  for (const item of parsed.streams || []) {
    descriptors.push({ type: item.type, symbol: item.symbol, interval: item.interval });
  }
  return descriptors;
};

const createMarketWebSocket = (server, options = {}) => {
  const hub = options.hub || createMarketStreamHub();
  const allowOrigin = options.allowOrigin || (() => true);

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

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

  const applyAction = async (state, action, descriptors) => {
    const requested = [];
    const resolved = [];
    const invalid = [];

    for (const descriptor of descriptors) {
      let normalized;
      try {
        normalized = normalizeStreamDescriptor(descriptor);
      } catch (err) {
        invalid.push({ ...descriptor, reason: err.message });
        continue;
      }

      const streamKey = buildStreamKey(normalized);
      const summary = { stream: streamKey, ...normalized };
      requested.push(summary);

      const isSubscribed = state.streams.has(streamKey);

      if (action === 'subscribe' && isSubscribed) {
        resolved.push({ ...summary, alreadySubscribed: true });
        continue;
      }
      if (action === 'unsubscribe' && !isSubscribed) {
        resolved.push({ ...summary, notSubscribed: true });
        continue;
      }

      try {
        if (action === 'subscribe') {
          const listener = (data) => send(ws, enrichMarketMessage({ descriptor: normalized, data }));
          await hub.subscribe(normalized, listener);
          state.streams.set(streamKey, { descriptor: normalized, listener });
        } else {
          const entry = state.streams.get(streamKey);
          await hub.unsubscribe(streamKey, entry.listener);
          state.streams.delete(streamKey);
        }
        resolved.push(summary);
      } catch (err) {
        invalid.push({ stream: streamKey, ...normalized, reason: err.message });
      }
    }

    return { requested, resolved, invalid };
  };

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    const state = { streams: new Map() };

    send(ws, {
      type: 'welcome',
      endpoint: WS_PATH,
      message: 'Crypto market WebSocket connected',
      protocol: {
        actions: ['subscribe', 'unsubscribe'],
        channels: ['trade', 'ticker', 'kline'],
        klineIntervals: ['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'],
      },
    });

    ws.on('message', async (raw) => {
      let parsed;
      try {
        parsed = parsePayload(raw.toString());
      } catch (err) {
        send(ws, { type: 'error', error: { code: 'INVALID_MESSAGE', message: err.message } });
        return;
      }

      try {
        const { requested, resolved, invalid } = await applyAction(state, parsed.action, expandRequest(parsed));
        send(ws, { type: 'ack', action: parsed.action, requested, subscribed: resolved, invalid });
      } catch (err) {
        send(ws, { type: 'error', error: { code: 'INTERNAL_ERROR', message: err.message } });
      }
    });

    ws.on('close', async () => {
      for (const [streamKey, entry] of state.streams) {
        try {
          await hub.unsubscribe(streamKey, entry.listener);
        } catch (err) {
          console.error('[marketWs] cleanup unsubscribe error:', err?.message || err);
        }
      }
      state.streams.clear();
    });

    ws.on('error', (err) => {
      console.error('[marketWs] client error:', err?.message || err);
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
    clearInterval(heartbeat);
    for (const ws of wss.clients) {
      ws.close(1001, 'Server shutting down');
    }
    await hub.shutdown();
    wss.close();
  };

  return {
    wss,
    hub,
    getStatus: () => ({
      path: WS_PATH,
      clients: wss.clients.size,
      hub: hub.getStatus(),
    }),
    close,
  };
};

module.exports = { createMarketWebSocket, WS_PATH };