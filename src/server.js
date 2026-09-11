const http = require('http');
const app = require('./app');
const env = require('./config/env');
const { createMarketWebSocket } = require('./ws/market.ws');
const { createLiveWebSocket } = require('./ws/live.ws');

const PORT = env.PORT;

const server = http.createServer(app);
const marketWs = createMarketWebSocket(server);
const liveWs = createLiveWebSocket(server);

server.listen(PORT, () => {
  console.log(`Crypto Backend API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Market WebSocket: ws://localhost:${PORT}/ws/market`);
  console.log(`Live WebSocket: ws://localhost:${PORT}/ws/live`);
  console.log(`Tracked coins: ${liveWs.getStatus().symbols.join(', ')}`);
});

const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down...`);
  try {
    await marketWs.close();
    await liveWs.close();
  } catch (err) {
    console.error('Error closing WebSockets:', err?.message || err);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));