const axios = require('axios');
const logger = require('../utils/logger');

// Provider registry with 3 initial nodes
const providers = [
  {
    id: 'triton-old-faithful',
    name: 'Triton Old Faithful (Premium)',
    url: process.env.OLD_FAITHFUL_RPC_URL || 'https://rlock-solanad-de21.devnet.rpcpool.com/ba715b75-838e-4fc8-b4d7-5e518c00032a',
    type: 'premium',
    pricing: 1.0, // Base multiplier
    reputation: 100, // 0-100 score
    uptime: 99.9,
    latency: 50, // ms average
    features: ['historical', 'geyser', 'high-throughput'],
    metadata: {
      provider: 'Triton',
      region: 'us-east',
      dataRetention: '5 years',
    },
  },
  {
    id: 'solana-devnet-public',
    name: 'Solana Devnet (Public)',
    url: process.env.FALLBACK_RPC_URL || 'https://api.devnet.solana.com',
    type: 'public',
    pricing: 0.5, // 50% cheaper
    reputation: 85,
    uptime: 98.5,
    latency: 120,
    features: ['standard', 'free-tier'],
    metadata: {
      provider: 'Solana Foundation',
      region: 'global',
      dataRetention: '1 month',
    },
  },
  {
    id: 'community-archive',
    name: 'Community Archive Node',
    url: 'https://api.devnet.solana.com', // Using public as placeholder for demo
    type: 'community',
    pricing: 0.3, // 70% cheaper
    reputation: 75,
    uptime: 95.0,
    latency: 200,
    features: ['historical', 'community-supported'],
    metadata: {
      provider: 'Community',
      region: 'eu-west',
      dataRetention: '2 years',
    },
  },
];

// Provider health tracking
const providerHealth = new Map();

/**
 * Get all available providers
 * @returns {Array} List of providers with stats
 */
function getProviders() {
  return providers.map((provider) => ({
    ...provider,
    health: providerHealth.get(provider.id) || {
      status: 'unknown',
      lastCheck: null,
      consecutiveFailures: 0,
    },
  }));
}

/**
 * Select the best provider based on pricing, reputation, and health
 * @param {Object} options - Selection criteria
 * @param {string} options.method - RPC method being called
 * @param {boolean} options.requireHistorical - Whether historical data is required
 * @param {boolean} options.preferCheapest - Prefer lowest price over quality
 * @returns {Object} Selected provider
 */
function selectBestProvider(options = {}) {
  const { method, requireHistorical = false, preferCheapest = false } = options;

  // Filter providers based on requirements
  let candidates = providers.filter((p) => {
    const health = providerHealth.get(p.id);
    
    // Skip unhealthy providers
    if (health?.consecutiveFailures > 3) {
      return false;
    }

    // Filter by historical data requirement
    if (requireHistorical && !p.features.includes('historical')) {
      return false;
    }

    return true;
  });

  if (candidates.length === 0) {
    logger.warn('No healthy providers available, using any provider');
    candidates = providers;
  }

  // Score providers
  const scored = candidates.map((provider) => {
    let score = 0;

    if (preferCheapest) {
      // Prioritize pricing (inverted - lower price = higher score)
      score += (1 - provider.pricing) * 50;
      score += (provider.reputation / 100) * 30;
      score += (provider.uptime / 100) * 20;
    } else {
      // Balanced scoring
      score += (provider.reputation / 100) * 40;
      score += (provider.uptime / 100) * 30;
      score += (1 - provider.pricing) * 20;
      score += (1 - provider.latency / 500) * 10; // Normalize latency
    }

    return { provider, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const selected = scored[0].provider;
  logger.info(`Selected provider: ${selected.name} (score: ${scored[0].score.toFixed(2)})`);

  return selected;
}

/**
 * Fetch data from a specific provider
 * @param {Object} provider - Provider to use
 * @param {Object} body - JSON-RPC request body
 * @returns {Promise<Object>} JSON-RPC response
 */
async function fetchFromProvider(provider, body) {
  try {
    logger.info(`Fetching ${body.method} from ${provider.name}`);

    const response = await axios.post(provider.url, body, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Update health on success
    providerHealth.set(provider.id, {
      status: 'healthy',
      lastCheck: new Date().toISOString(),
      consecutiveFailures: 0,
    });

    return response.data;
  } catch (error) {
    logger.error(`Provider ${provider.name} failed: ${error.message}`);

    // Update health on failure
    const health = providerHealth.get(provider.id) || { consecutiveFailures: 0 };
    providerHealth.set(provider.id, {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      consecutiveFailures: health.consecutiveFailures + 1,
    });

    throw error;
  }
}

/**
 * Fetch data with automatic provider selection and fallback
 * @param {Object} body - JSON-RPC request body
 * @param {Object} options - Selection options
 * @returns {Promise<Object>} JSON-RPC response
 */
async function fetchWithBestProvider(body, options = {}) {
  // Determine if historical data is required
  const historicalMethods = ['getBlock', 'getTransaction', 'getSignaturesForAddress'];
  const requireHistorical = historicalMethods.includes(body.method);

  const selectionOptions = {
    method: body.method,
    requireHistorical,
    ...options,
  };

  // Try primary provider
  const primaryProvider = selectBestProvider(selectionOptions);
  
  try {
    return await fetchFromProvider(primaryProvider, body);
  } catch (primaryError) {
    logger.warn(`Primary provider failed, trying fallback...`);

    // Try fallback provider (different from primary)
    const fallbackCandidates = providers.filter((p) => p.id !== primaryProvider.id);
    
    for (const fallbackProvider of fallbackCandidates) {
      try {
        logger.info(`Attempting fallback to ${fallbackProvider.name}`);
        return await fetchFromProvider(fallbackProvider, body);
      } catch (fallbackError) {
        logger.warn(`Fallback ${fallbackProvider.name} also failed`);
        continue;
      }
    }

    // All providers failed
    logger.error('All providers failed');
    return {
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32603,
        message: 'Internal error: All data providers unavailable',
        data: primaryError.message,
      },
    };
  }
}

/**
 * Add a new provider to the registry
 * @param {Object} providerData - Provider configuration
 * @returns {Object} Added provider
 */
function addProvider(providerData) {
  const newProvider = {
    id: providerData.id || `provider-${Date.now()}`,
    name: providerData.name,
    url: providerData.url,
    type: providerData.type || 'community',
    pricing: providerData.pricing || 1.0,
    reputation: providerData.reputation || 50,
    uptime: providerData.uptime || 95.0,
    latency: providerData.latency || 150,
    features: providerData.features || ['standard'],
    metadata: providerData.metadata || {},
  };

  providers.push(newProvider);
  logger.info(`Added new provider: ${newProvider.name}`);

  return newProvider;
}

/**
 * Health check for a specific provider
 * @param {string} providerId - Provider ID
 * @returns {Promise<Object>} Health check result
 */
async function healthCheckProvider(providerId) {
  const provider = providers.find((p) => p.id === providerId);
  
  if (!provider) {
    throw new Error('Provider not found');
  }

  try {
    const testBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getHealth',
    };

    const startTime = Date.now();
    await axios.post(provider.url, testBody, { timeout: 5000 });
    const responseTime = Date.now() - startTime;

    const health = {
      status: 'healthy',
      responseTime,
      lastCheck: new Date().toISOString(),
      consecutiveFailures: 0,
    };

    providerHealth.set(provider.id, health);
    return health;
  } catch (error) {
    const health = providerHealth.get(provider.id) || { consecutiveFailures: 0 };
    const updatedHealth = {
      status: 'unhealthy',
      error: error.message,
      lastCheck: new Date().toISOString(),
      consecutiveFailures: health.consecutiveFailures + 1,
    };

    providerHealth.set(provider.id, updatedHealth);
    return updatedHealth;
  }
}

module.exports = {
  getProviders,
  selectBestProvider,
  fetchWithBestProvider,
  addProvider,
  healthCheckProvider,
};
