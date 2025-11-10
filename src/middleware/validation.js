const Joi = require('joi');
const { validate: uuidValidate } = require('uuid');
const logger = require('../utils/logger');

/**
 * Joi schema for JSON-RPC 2.0 request
 */
const rpcRequestSchema = Joi.object({
  jsonrpc: Joi.string().valid('2.0').required(),
  method: Joi.string().required().max(100),
  params: Joi.alternatives().try(
    Joi.array().max(10),
    Joi.object()
  ).optional(),
  id: Joi.alternatives().try(
    Joi.string().max(100),
    Joi.number(),
    Joi.allow(null)
  ).required(),
}).options({ stripUnknown: true });

/**
 * Joi schema for payment payload
 */
const paymentPayloadSchema = Joi.object({
  txSignature: Joi.string().min(80).max(100).required(),
  paymentId: Joi.string().uuid().required(),
}).unknown(false);

/**
 * Middleware to validate RPC request body
 */
function validateRpcRequest(req, res, next) {
  const { error, value } = rpcRequestSchema.validate(req.body);
  
  if (error) {
    logger.warn(`Invalid RPC request: ${error.message}`);
    return res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid Request',
        data: error.details[0].message,
      },
      id: req.body?.id || null,
    });
  }
  
  // Replace body with validated value
  req.body = value;
  next();
}

/**
 * Middleware to validate and sanitize payment header
 */
function validatePaymentHeader(req, res, next) {
  const xPaymentHeader = req.headers['x-payment'];
  
  if (!xPaymentHeader) {
    // No payment header is valid (will trigger 402)
    return next();
  }
  
  try {
    // Decode and parse
    const decodedPayment = Buffer.from(xPaymentHeader, 'base64').toString('utf8');
    const paymentPayload = JSON.parse(decodedPayment);
    
    // Validate structure
    const { error, value } = paymentPayloadSchema.validate(paymentPayload);
    
    if (error) {
      logger.warn(`Invalid payment header: ${error.message}`);
      return res.status(402).json({
        error: 'invalid_payment_header',
        message: 'Payment header validation failed',
        details: error.details[0].message,
      });
    }
    
    // Additional UUID validation for paymentId
    if (!uuidValidate(value.paymentId)) {
      logger.warn(`Invalid payment ID format: ${value.paymentId}`);
      return res.status(402).json({
        error: 'invalid_payment_id',
        message: 'Payment ID must be a valid UUID',
      });
    }
    
    // Store validated payment in request
    req.validatedPayment = value;
    next();
  } catch (parseError) {
    logger.warn('Payment header parsing failed:', parseError.message);
    return res.status(402).json({
      error: 'invalid_payment_header',
      message: 'X-Payment header must be base64-encoded JSON',
    });
  }
}

/**
 * Sanitize method name to prevent injection attacks
 */
function sanitizeMethodName(method) {
  // Remove any non-alphanumeric characters except underscore
  return method.replace(/[^a-zA-Z0-9_]/g, '');
}

/**
 * Validate provider data
 */
const providerSchema = Joi.object({
  id: Joi.string().min(3).max(50).pattern(/^[a-z0-9-]+$/).required(),
  name: Joi.string().min(3).max(100).required(),
  url: Joi.string().uri().required(),
  type: Joi.string().valid('premium', 'public', 'community').required(),
  pricing: Joi.number().min(0).max(10).required(),
  reputation: Joi.number().min(0).max(100).default(50),
  features: Joi.array().items(Joi.string().max(50)).default([]),
  metadata: Joi.object().default({}),
}).options({ stripUnknown: true });

/**
 * Middleware to validate provider data
 */
function validateProvider(req, res, next) {
  const { error, value } = providerSchema.validate(req.body);
  
  if (error) {
    logger.warn(`Invalid provider data: ${error.message}`);
    return res.status(400).json({
      success: false,
      error: 'validation_error',
      message: error.details[0].message,
    });
  }
  
  req.body = value;
  next();
}

module.exports = {
  validateRpcRequest,
  validatePaymentHeader,
  validateProvider,
  sanitizeMethodName,
};
