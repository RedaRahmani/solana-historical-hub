const client = require('prom-client');
const { getRevenueMetrics } = require('../services/paymentService');

// Initialize Prometheus metrics registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
const requestCounter = new client.Counter({
  name: 'rpc_requests_total',
  help: 'Total number of RPC requests',
  labelNames: ['method', 'status'],
  registers: [register],
});

const paymentCounter = new client.Counter({
  name: 'payments_total',
  help: 'Total number of successful payments',
  registers: [register],
});

const revenueGauge = new client.Gauge({
  name: 'revenue_usdc_total',
  help: 'Total revenue in USDC',
  registers: [register],
});

const requestDuration = new client.Histogram({
  name: 'rpc_request_duration_seconds',
  help: 'RPC request duration in seconds',
  labelNames: ['method'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

/**
 * Track an RPC request
 * @param {string} method - RPC method name
 * @param {string} status - Request status (success, payment_required, error)
 */
function trackRequest(method, status = 'success') {
  requestCounter.inc({ method, status });
}

/**
 * Track a successful payment
 */
function trackPayment() {
  paymentCounter.inc();
}

/**
 * Update revenue metrics
 * @param {number} amount - Amount in USDC
 */
function updateRevenue(amount) {
  revenueGauge.inc(amount);
}

/**
 * Track request duration
 * @param {string} method - RPC method name
 * @param {number} duration - Duration in seconds
 */
function trackDuration(method, duration) {
  requestDuration.observe({ method }, duration);
}

/**
 * Prometheus metrics endpoint handler
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function metricsHandler(req, res) {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
}

/**
 * JSON metrics endpoint handler with business metrics
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function jsonMetricsHandler(req, res) {
  try {
    const revenueMetrics = getRevenueMetrics();
    
    // Get Prometheus metrics as JSON
    const promMetrics = await register.getMetricsAsJSON();
    
    // Extract key metrics
    const requestsTotal = promMetrics.find((m) => m.name === 'rpc_requests_total');
    const paymentsTotal = promMetrics.find((m) => m.name === 'payments_total');
    const revenueTotal = promMetrics.find((m) => m.name === 'revenue_usdc_total');
    
    res.json({
      timestamp: new Date().toISOString(),
      requests: {
        total: requestsTotal?.values?.reduce((sum, v) => sum + v.value, 0) || 0,
        byMethod: requestsTotal?.values?.reduce((acc, v) => {
          const method = v.labels.method;
          if (!acc[method]) acc[method] = 0;
          acc[method] += v.value;
          return acc;
        }, {}) || {},
      },
      payments: {
        total: paymentsTotal?.values?.[0]?.value || 0,
      },
      revenue: {
        total: revenueMetrics.totalRevenue,
        gateway: revenueMetrics.gatewayRevenue,
        dataProvider: revenueMetrics.dataProviderRevenue,
        gatewayPercentage: revenueMetrics.gatewaySplit * 100,
        dataProviderPercentage: (1 - revenueMetrics.gatewaySplit) * 100,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate JSON metrics' });
  }
}

module.exports = {
  metricsHandler,
  jsonMetricsHandler,
  trackRequest,
  trackPayment,
  updateRevenue,
  trackDuration,
};
