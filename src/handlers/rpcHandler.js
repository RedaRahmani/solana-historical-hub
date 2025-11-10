const { v4: uuidv4 } = require('uuid');
const { fetchFromOldFaithful } = require('../services/oldFaithfulProxy');
const { verifyPayment, settlePayment } = require('../services/paymentService');
const { paymentStore } = require('../stores/paymentStore');
const logger = require('../utils/logger');
const { calculatePrice } = require('../utils/pricing');

/**
 * Main RPC handler implementing x402 payment flow
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleRpc(req, res) {
  try {
    const xPaymentHeader = req.headers['x-payment'];

    // Step 1: No payment header - return 402 with payment challenge
    if (!xPaymentHeader) {
      return sendPaymentRequired(res, 'Payment required', req.body);
    }

    // Step 2: Payment header present - verify and process
    let paymentPayload;
    try {
      const decodedPayment = Buffer.from(xPaymentHeader, 'base64').toString('utf8');
      paymentPayload = JSON.parse(decodedPayment);
    } catch (parseError) {
      logger.warn('Invalid X-Payment header format:', parseError.message);
      return res.status(402).json({
        error: 'invalid_payment_header',
        message: 'X-Payment header must be base64-encoded JSON',
      });
    }

    const { txSignature, paymentId } = paymentPayload;

    if (!txSignature || !paymentId) {
      logger.warn('Missing txSignature or paymentId in payment payload');
      return res.status(402).json({
        error: 'invalid_payment_payload',
        message: 'Payment payload must include txSignature and paymentId',
      });
    }

    // Step 3: Check payment invoice exists and is not already used
    const invoice = await paymentStore.get(paymentId);
    if (!invoice) {
      logger.warn(`Payment ID not found: ${paymentId}`);
      return sendPaymentRequired(res, 'Payment ID not found or expired');
    }

    if (invoice.used) {
      logger.warn(`Payment ID already used: ${paymentId}`);
      return res.status(402).json({
        error: 'payment_already_used',
        message: 'This payment has already been used',
      });
    }

    // Step 4: Verify payment with facilitator or fallback
    const verificationResult = await verifyPayment({
      txSignature,
      paymentId,
      expectedAmount: invoice.amount,
      mint: process.env.USDC_MINT,
      recipient: process.env.PAYMENT_WALLET_ADDRESS,
    });

    if (!verificationResult.valid) {
      logger.warn(`Payment verification failed: ${txSignature}`, verificationResult);
      return res.status(402).json({
        error: 'payment_invalid',
        message: 'Payment verification failed',
        details: verificationResult.reason,
      });
    }

    // Step 5: Mark payment as used (prevent replay attacks)
    await paymentStore.markAsUsed(paymentId);
    logger.info(`Payment verified and marked as used: ${paymentId}, tx: ${txSignature}`);

    // Step 6: Execute settle and fetch data in parallel (optimistic)
    const [settleResult, rpcResult] = await Promise.all([
      settlePayment({ txSignature, paymentId, amount: invoice.amount }).catch((err) => {
        logger.error('Settlement failed (non-blocking):', err.message);
        return { error: err.message };
      }),
      fetchFromOldFaithful(req.body),
    ]);

    // Step 7: Return successful response with payment receipt
    const paymentResponse = {
      txSignature,
      paymentId,
      settled: !settleResult.error,
    };

    res.setHeader(
      'X-Payment-Response',
      Buffer.from(JSON.stringify(paymentResponse)).toString('base64')
    );

    return res.status(200).json(rpcResult);
  } catch (error) {
    logger.error('Unexpected error in handleRpc:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred processing your request',
    });
  }
}

/**
 * Send 402 Payment Required response with x402 challenge
 * @param {import('express').Response} res
 * @param {string} [message]
 * @param {Object} [requestBody] - RPC request body for dynamic pricing
 */
async function sendPaymentRequired(res, message = 'Payment required', requestBody = null) {
  const paymentId = uuidv4();
  
  // Calculate dynamic price based on RPC method
  let amount;
  if (requestBody && requestBody.method) {
    amount = calculatePrice(requestBody.method, requestBody.params || []);
  } else {
    amount = parseFloat(process.env.PRICE_PER_QUERY || '0.001');
  }
  
  const amountStr = amount.toFixed(6);

  // Store invoice
  await paymentStore.create(paymentId, {
    amount: amountStr,
    createdAt: Date.now(),
    used: false,
    method: requestBody?.method || 'unknown',
  });

  logger.info(`Payment challenge: ${paymentId}, method: ${requestBody?.method || 'unknown'}, amount: ${amountStr} USDC`);

  return res.status(402).json({
    error: 'payment_required',
    message,
    accepts: [
      {
        asset: 'USDC',
        chain: 'solana-devnet',
        amount: amountStr,
        paymentAddress: process.env.PAYMENT_WALLET_ADDRESS,
        paymentId,
        scheme: 'exact',
        method: requestBody?.method || 'unknown',
      },
    ],
  });
}

module.exports = { handleRpc };
