const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/health.routes');
const marketRoutes = require('./routes/market.routes');
const cmcRoutes = require('./routes/cmc.routes');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/v1', healthRoutes);
app.use('/api/v1/market', marketRoutes);
app.use('/api/v1/research', cmcRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    message: `Route ${req.originalUrl} not found`,
  });
});

app.use(errorMiddleware);

module.exports = app;
