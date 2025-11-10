require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { handleRpc } = require('./handlers/rpcHandler');
const { metricsHandler, jsonMetricsHandler } = require('./handlers/metricsHandler');
const { 
  listProvidersHandler, 
  addProviderHandler, 
  providerHealthHandler 
} = require('./handlers/providersHandler');
const { uiHandler } = require('./handlers/uiHandler');
const { validateRpcRequest, validatePaymentHeader, validateProvider } = require('./middleware/validation');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow for development
  crossOriginEmbedderPolicy: false,
}));

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' })); // Limit payload size

// Rate limiting: 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'rate_limit_exceeded', message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'solana-historical-hub',
    version: '1.0.0',
  });
});

// Metrics endpoints
app.get('/metrics', metricsHandler);
app.get('/metrics/json', jsonMetricsHandler);

// Web UI
app.get('/ui', uiHandler);

// Provider marketplace endpoints
app.get('/providers', listProvidersHandler);
app.post('/providers/add', validateProvider, addProviderHandler);
app.get('/providers/health', providerHealthHandler);

// Main RPC endpoint with x402 payment handling (with validation)
app.post('/', validateRpcRequest, validatePaymentHeader, handleRpc);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found. Send JSON-RPC requests to POST /',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'internal_error',
    message: 'An unexpected error occurred',
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Solana Historical Hub listening on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Old Faithful RPC: ${process.env.OLD_FAITHFUL_RPC_URL || 'http://localhost:8899'}`);
  });
}

module.exports = app;
