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

// --- Environment hardening for serverless (Vercel) ---
function normalizeEnv() {
  // Force remote RPC if localhost is detected
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc || /localhost|127\.0\.0\.1/i.test(rpc)) {
    process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
  }

  // Provide a safe default Old Faithful remote if none configured
  if (!process.env.OLD_FAITHFUL_RPC_URL || /localhost|127\.0\.0\.1/i.test(process.env.OLD_FAITHFUL_RPC_URL)) {
    process.env.OLD_FAITHFUL_RPC_URL = 'https://rlock-solanad-de21.devnet.rpcpool.com/ba715b75-838e-4fc8-b2d7-5e518c00032a';
  }

  // Disable Redis on serverless when local/empty
  const redisUrl = process.env.REDIS_URL || '';
  if (!redisUrl || /localhost|127\.0\.0\.1/i.test(redisUrl)) {
    process.env.SKIP_REDIS = '1';
  }

  // Validate critical vars
  const missing = [];
  if (!process.env.USDC_MINT) missing.push('USDC_MINT');
  if (!process.env.PAYMENT_WALLET_ADDRESS) missing.push('PAYMENT_WALLET_ADDRESS');
  if (missing.length) {
    console.warn(`[config] Missing ${missing.join(', ')} — payments may not function. Set these in Vercel env.`);
  }
  console.info(`[config] RPC = ${process.env.SOLANA_RPC_URL}`);
  console.info(`[config] OLD_FAITHFUL_RPC_URL = ${process.env.OLD_FAITHFUL_RPC_URL}`);
  console.info(`[config] Redis = ${process.env.SKIP_REDIS === '1' ? 'disabled' : (process.env.REDIS_URL || 'disabled')}`);
}

normalizeEnv();

const app = express();
// Trust proxy headers (Vercel / reverse proxies set X-Forwarded-For)
// This is required so express-rate-limit can correctly identify clients
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow for development
  crossOriginEmbedderPolicy: false,
}));

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' })); // Limit payload size
// Serve static UI assets
app.use(express.static('public'));

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

// Redirect root to the web UI so visiting / shows the UI immediately
app.get('/', (req, res) => {
  // Prefer a server-side redirect to keep URLs simple for users and bots
  res.redirect('/ui');
});

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
