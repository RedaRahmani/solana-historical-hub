const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Client for interacting with x402 payment facilitator (e.g., PayAI)
 * TODO: Align request/response schemas with actual facilitator API documentation
 */
class FacilitatorClient {
  constructor({ verifyUrl, settleUrl }) {
    this.verifyUrl = verifyUrl;
    this.settleUrl = settleUrl;
  }

  /**
   * Verify a payment with the facilitator
   * @param {Object} params
   * @param {string} params.txSignature - Solana transaction signature
   * @param {string} params.paymentId - Payment nonce/ID
   * @param {string} params.expectedAmount - Expected USDC amount
   * @param {string} params.mint - USDC mint address
   * @param {string} params.recipient - Payment recipient wallet
   * @returns {Promise<{valid: boolean, reason?: string, raw?: any}>}
   */
  async verifyPayment({ txSignature, paymentId, expectedAmount, mint, recipient }) {
    try {
      if (!this.verifyUrl) {
        throw new Error('Facilitator verify URL not configured');
      }

      // TODO: Adjust this payload to match actual facilitator API
      // This is a best-guess based on common x402 patterns
      const payload = {
        txSignature,
        paymentId,
        expectedAmount,
        mint,
        recipient,
        chain: 'solana-devnet',
      };

      logger.debug('Sending verification request to facilitator:', payload);

      const response = await axios.post(this.verifyUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          // TODO: Add authentication header if required by facilitator
          // 'Authorization': `Bearer ${process.env.FACILITATOR_API_KEY}`,
        },
      });

      // TODO: Adjust response parsing based on actual facilitator response format
      const { data } = response;

      if (data.verified === true || data.valid === true || data.status === 'success') {
        return { valid: true, raw: data };
      }

      return {
        valid: false,
        reason: data.reason || data.message || 'Verification failed',
        raw: data,
      };
    } catch (error) {
      logger.error('Facilitator verification request failed:', error.message);

      if (error.response) {
        logger.error('Facilitator error response:', error.response.data);
        return {
          valid: false,
          reason: error.response.data?.message || 'Facilitator returned error',
          raw: error.response.data,
        };
      }

      throw error;
    }
  }

  /**
   * Settle a payment with the facilitator
   * @param {Object} params
   * @param {string} params.txSignature - Solana transaction signature
   * @param {string} params.paymentId - Payment nonce/ID
   * @returns {Promise<any>}
   */
  async settlePayment({ txSignature, paymentId }) {
    try {
      if (!this.settleUrl) {
        throw new Error('Facilitator settle URL not configured');
      }

      // TODO: Adjust this payload to match actual facilitator API
      const payload = {
        txSignature,
        paymentId,
        chain: 'solana-devnet',
      };

      logger.debug('Sending settlement request to facilitator:', payload);

      const response = await axios.post(this.settleUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          // TODO: Add authentication header if required
          // 'Authorization': `Bearer ${process.env.FACILITATOR_API_KEY}`,
        },
      });

      logger.debug('Settlement response:', response.data);

      return response.data;
    } catch (error) {
      logger.error('Facilitator settlement request failed:', error.message);

      if (error.response) {
        logger.error('Facilitator error response:', error.response.data);
      }

      throw error;
    }
  }
}

module.exports = FacilitatorClient;
