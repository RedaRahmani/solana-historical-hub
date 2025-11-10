/**
 * Dynamic Pricing Utility for RPC Methods
 * 
 * Implements tiered pricing based on RPC method complexity and query context.
 * Supports environment variable overrides for flexible pricing strategies.
 */

const logger = require('./logger');

// Default pricing tiers (in USDC)
const DEFAULT_PRICES = {
  // Light operations
  getHealth: 0.0001,
  getSlot: 0.0001,
  getBlockHeight: 0.0001,
  getEpochInfo: 0.0001,
  
  // Medium operations
  getBlockTime: 0.0003,
  getFirstAvailableBlock: 0.0003,
  
  // Heavy operations (historical data)
  getBlock: 0.001,
  getTransaction: 0.0005,
  getSignaturesForAddress: 0.0008,
  
  // Default for unknown methods
  default: 0.001,
};

// Context multipliers
const CONTEXT_MULTIPLIERS = {
  deepHistorical: 1.5,  // Slot < 100,000
  bulkQuery: 1.3,       // Multiple items
  realTime: 0.8,        // Current data
};

/**
 * Calculate price for an RPC method with context
 * @param {string} method - RPC method name
 * @param {Array} params - Method parameters
 * @returns {number} - Price in USDC
 */
function calculatePrice(method, params = []) {
  // Get base price
  let basePrice = DEFAULT_PRICES[method] || DEFAULT_PRICES.default;
  
  // Check env override
  const envVar = `PRICE_${method.toUpperCase()}`;
  if (process.env[envVar]) {
    basePrice = parseFloat(process.env[envVar]);
  }
  
  // Analyze context
  let multiplier = 1.0;
  
  if (method === 'getBlock' || method === 'getTransaction') {
    const slot = params[0];
    if (typeof slot === 'number' && slot < 100000) {
      multiplier = CONTEXT_MULTIPLIERS.deepHistorical;
      logger.debug(`Deep historical multiplier applied: ${multiplier}x`);
    }
  }
  
  if (method === 'getSlot' || method === 'getBlockHeight') {
    multiplier = CONTEXT_MULTIPLIERS.realTime;
  }
  
  if (method === 'getSignaturesForAddress') {
    const options = params[1] || {};
    if (options.limit && options.limit > 10) {
      multiplier = CONTEXT_MULTIPLIERS.bulkQuery;
    }
  }
  
  const finalPrice = Math.round(basePrice * multiplier * 1000000) / 1000000;
  logger.info(`Price for ${method}: ${finalPrice} USDC (base: ${basePrice}, multiplier: ${multiplier})`);
  
  return finalPrice;
}

module.exports = {
  calculatePrice,
  DEFAULT_PRICES,
  CONTEXT_MULTIPLIERS,
};
