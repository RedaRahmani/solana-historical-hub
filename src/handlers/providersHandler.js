const { 
  getProviders, 
  addProvider, 
  healthCheckProvider 
} = require('../services/providersService');
const logger = require('../utils/logger');

/**
 * GET /providers - List all available data providers
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function listProvidersHandler(req, res) {
  try {
    const providers = getProviders();
    
    res.json({
      success: true,
      count: providers.length,
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        pricing: p.pricing,
        reputation: p.reputation,
        uptime: p.uptime,
        latency: p.latency,
        features: p.features,
        health: p.health,
        metadata: p.metadata,
      })),
    });
  } catch (error) {
    logger.error('Failed to list providers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve providers',
    });
  }
}

/**
 * POST /providers/add - Add a new data provider
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function addProviderHandler(req, res) {
  try {
    const { name, url, type, pricing, features, metadata } = req.body;

    // Basic validation
    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, url',
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format',
      });
    }

    const newProvider = addProvider({
      name,
      url,
      type,
      pricing,
      features,
      metadata,
    });

    logger.info(`New provider added via API: ${newProvider.name}`);

    res.status(201).json({
      success: true,
      provider: newProvider,
    });
  } catch (error) {
    logger.error('Failed to add provider:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add provider',
    });
  }
}

/**
 * GET /providers/:id/health - Check health of a specific provider
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function providerHealthHandler(req, res) {
  try {
    const { id } = req.params;
    
    const health = await healthCheckProvider(id);
    
    res.json({
      success: true,
      providerId: id,
      health,
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
}

module.exports = {
  listProvidersHandler,
  addProviderHandler,
  providerHealthHandler,
};
