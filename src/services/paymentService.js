const FacilitatorClient = require('../clients/facilitatorClient');
const { verifyPaymentOnChain } = require('./blockchainVerifier');
const logger = require('../utils/logger');

// Revenue sharing configuration
const FEE_SPLIT_GATEWAY = parseFloat(process.env.FEE_SPLIT_GATEWAY || '30');
const FEE_SPLIT_DATA_PROVIDER = parseFloat(process.env.FEE_SPLIT_DATA_PROVIDER || '70');

// Revenue tracking
let totalRevenue = 0;
let gatewayRevenue = 0;
let dataProviderRevenue = 0;
let transactionCount = 0;

const facilitator = new FacilitatorClient({
  verifyUrl: process.env.FACILITATOR_VERIFY_URL,
  settleUrl: process.env.FACILITATOR_SETTLE_URL,
});

/**
 * Verify payment using facilitator or fallback to on-chain verification
 * @param {Object} params
 * @param {string} params.txSignature - Solana transaction signature
 * @param {string} params.paymentId - Payment nonce/ID
 * @param {string} params.expectedAmount - Expected USDC amount (e.g., "0.001")
 * @param {string} params.mint - USDC mint address
 * @param {string} params.recipient - Payment recipient wallet address
 * @returns {Promise<{valid: boolean, reason?: string, raw?: any}>}
 */
async function verifyPayment({ txSignature, paymentId, expectedAmount, mint, recipient }) {
  try {
    // Try facilitator verification first
    if (process.env.FACILITATOR_VERIFY_URL) {
      logger.info(`Verifying payment via facilitator: ${txSignature}`);
      const result = await facilitator.verifyPayment({
        txSignature,
        paymentId,
        expectedAmount,
        mint,
        recipient,
      });

      if (result.valid) {
        logger.info(`Payment verified via facilitator: ${txSignature}`);
        return result;
      }

      logger.warn(`Facilitator verification failed, trying on-chain fallback: ${result.reason}`);
    }

    // Fallback to on-chain verification
    logger.info(`Verifying payment on-chain: ${txSignature}`);
    const onChainResult = await verifyPaymentOnChain({
      txSignature,
      paymentId,
      expectedAmount,
      mint,
      recipient,
    });

    return onChainResult;
  } catch (error) {
    logger.error('Payment verification error:', error);
    return {
      valid: false,
      reason: `Verification error: ${error.message}`,
    };
  }
}

/**
 * Settle payment with facilitator and track revenue splits
 * @param {Object} params
 * @param {string} params.txSignature - Solana transaction signature
 * @param {string} params.paymentId - Payment nonce/ID
 * @param {string} [params.amount] - Payment amount for revenue tracking
 * @returns {Promise<any>}
 */
async function settlePayment({ txSignature, paymentId, amount = null }) {
  try {
    // Track revenue split
    if (amount) {
      const paymentAmount = parseFloat(amount);
      const gatewayShare = paymentAmount * (FEE_SPLIT_GATEWAY / 100);
      const providerShare = paymentAmount * (FEE_SPLIT_DATA_PROVIDER / 100);
      
      totalRevenue += paymentAmount;
      gatewayRevenue += gatewayShare;
      dataProviderRevenue += providerShare;
      transactionCount++;
      
      logger.info(`Fee split: Gateway ${gatewayShare.toFixed(6)} USDC (${FEE_SPLIT_GATEWAY}%), Provider ${providerShare.toFixed(6)} USDC (${FEE_SPLIT_DATA_PROVIDER}%)`);
      logger.info(`Total revenue: ${totalRevenue.toFixed(6)} USDC, Gateway ${gatewayRevenue.toFixed(6)}, Provider ${dataProviderRevenue.toFixed(6)}, Tx: ${transactionCount}`);
    }
    
    if (!process.env.FACILITATOR_SETTLE_URL) {
      logger.info('No facilitator settle URL configured, skipping settlement');
      return { settled: false, reason: 'no_facilitator' };
    }

    logger.info(`Settling payment via facilitator: ${txSignature}`);
    const result = await facilitator.settlePayment({ txSignature, paymentId });
    logger.info(`Payment settled: ${txSignature}`);
    return result;
  } catch (error) {
    logger.error('Payment settlement error:', error);
    throw error;
  }
}

/**
 * Get revenue metrics
 * @returns {Object} - Revenue statistics
 */
function getRevenueMetrics() {
  return {
    totalRevenue: totalRevenue.toFixed(6),
    gatewayRevenue: gatewayRevenue.toFixed(6),
    dataProviderRevenue: dataProviderRevenue.toFixed(6),
    transactionCount,
    feeSplit: {
      gatewayPercent: FEE_SPLIT_GATEWAY,
      dataProviderPercent: FEE_SPLIT_DATA_PROVIDER,
    },
  };
}

module.exports = {
  verifyPayment,
  settlePayment,
  getRevenueMetrics,
};
