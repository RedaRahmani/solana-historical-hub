const { fetchWithBestProvider } = require('./providersService');
const logger = require('../utils/logger');

/**
 * Proxy JSON-RPC requests to Old Faithful (now with provider marketplace)
 * @param {Object} body - JSON-RPC request body
 * @returns {Promise<Object>} JSON-RPC response
 */
async function fetchFromOldFaithful(body) {
  logger.info(`Proxying RPC request: ${body.method}`);
  logger.debug('RPC request:', body);

  // Use provider marketplace for intelligent routing
  return fetchWithBestProvider(body);
}


module.exports = {
  fetchFromOldFaithful,
};
