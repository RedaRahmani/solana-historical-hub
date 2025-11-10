const request = require('supertest');
const app = require('../../src/app');
const { paymentStore } = require('../../src/stores/paymentStore');
const { verifyPayment, settlePayment } = require('../../src/services/paymentService');
const { fetchFromOldFaithful } = require('../../src/services/oldFaithfulProxy');

jest.mock('../../src/services/paymentService');
jest.mock('../../src/services/oldFaithfulProxy');

describe('E2E: RPC Handler with x402 Payment Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear payment store
    paymentStore.invoices.clear();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('solana-historical-hub');
    });
  });

  describe('POST / - Unpaid Request', () => {
    it('should return 402 when no X-Payment header is provided', async () => {
      const rpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getBlock',
        params: [14000000],
      };

      const response = await request(app)
        .post('/')
        .send(rpcRequest)
        .expect(402);

      expect(response.body.error).toBe('payment_required');
      expect(response.body.accepts).toBeDefined();
      expect(response.body.accepts[0]).toMatchObject({
        asset: 'USDC',
        chain: 'solana-devnet',
        amount: '0.001',
        scheme: 'exact',
      });
      expect(response.body.accepts[0].paymentId).toBeDefined();
      expect(response.body.accepts[0].paymentAddress).toBe('testWallet123456789');
    });

    it('should store payment invoice in payment store', async () => {
      const rpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getBlock',
        params: [14000000],
      };

      const response = await request(app).post('/').send(rpcRequest);

      const paymentId = response.body.accepts[0].paymentId;
      const invoice = paymentStore.get(paymentId);

      expect(invoice).toBeDefined();
      expect(invoice.amount).toBe('0.001');
      expect(invoice.used).toBe(false);
    });
  });

  describe('POST / - Invalid Payment Header', () => {
    it('should return 402 for invalid base64 in X-Payment header', async () => {
      const rpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getBlock',
        params: [14000000],
      };

      const response = await request(app)
        .post('/')
        .set('X-Payment', 'invalid-base64!!!')
        .send(rpcRequest)
        .expect(402);

      expect(response.body.error).toBe('invalid_payment_header');
    });

    it('should return 402 for missing txSignature in payment payload', async () => {
      const paymentPayload = {
        paymentId: 'test-id',
        // Missing txSignature
      };

      const base64Payment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

      const response = await request(app)
        .post('/')
        .set('X-Payment', base64Payment)
        .send({ jsonrpc: '2.0', id: 1, method: 'getBlock', params: [14000000] })
        .expect(402);

      expect(response.body.error).toBe('invalid_payment_payload');
    });

    it('should return 402 for non-existent payment ID', async () => {
      const paymentPayload = {
        txSignature: '5j7s8K9L1mN2oP3qR4tU5vW6xY7zA8bC9dE0fG1hI2jK3lM4nO5pQ6rS7tU8vW9x',
        paymentId: 'non-existent-id',
      };

      const base64Payment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

      const response = await request(app)
        .post('/')
        .set('X-Payment', base64Payment)
        .send({ jsonrpc: '2.0', id: 1, method: 'getBlock', params: [14000000] })
        .expect(402);

      expect(response.body.message).toContain('Payment ID not found or expired');
    });
  });

  describe('POST / - Valid Payment Flow', () => {
    it('should process valid payment and return RPC data', async () => {
      // Step 1: Get payment challenge
      const rpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getBlock',
        params: [14000000],
      };

      const challengeResponse = await request(app).post('/').send(rpcRequest);
      const paymentId = challengeResponse.body.accepts[0].paymentId;

      // Step 2: Mock payment verification and settlement
      const mockRpcResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          blockhash: 'test-blockhash-123',
          transactions: [],
        },
      };

      verifyPayment.mockResolvedValue({ valid: true });
      settlePayment.mockResolvedValue({ settled: true });
      fetchFromOldFaithful.mockResolvedValue(mockRpcResponse);

      // Step 3: Send payment
      const paymentPayload = {
        txSignature: '5j7s8K9L1mN2oP3qR4tU5vW6xY7zA8bC9dE0fG1hI2jK3lM4nO5pQ6rS7tU8vW9x',
        paymentId,
      };

      const base64Payment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

      const response = await request(app)
        .post('/')
        .set('X-Payment', base64Payment)
        .send(rpcRequest)
        .expect(200);

      // Verify response
      expect(response.body).toEqual(mockRpcResponse);
      expect(response.headers['x-payment-response']).toBeDefined();

      // Verify payment was marked as used
      const invoice = paymentStore.get(paymentId);
      expect(invoice.used).toBe(true);

      // Verify mocks were called
      expect(verifyPayment).toHaveBeenCalled();
      expect(settlePayment).toHaveBeenCalled();
      expect(fetchFromOldFaithful).toHaveBeenCalledWith(rpcRequest);
    });

    it('should return 402 for already used payment', async () => {
      // Create and mark payment as used
      const paymentId = 'already-used-payment';
      paymentStore.create(paymentId, { amount: '0.001' });
      paymentStore.markAsUsed(paymentId);

      const paymentPayload = {
        txSignature: '5j7s8K9L1mN2oP3qR4tU5vW6xY7zA8bC9dE0fG1hI2jK3lM4nO5pQ6rS7tU8vW9x',
        paymentId,
      };

      const base64Payment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

      const response = await request(app)
        .post('/')
        .set('X-Payment', base64Payment)
        .send({ jsonrpc: '2.0', id: 1, method: 'getBlock', params: [14000000] })
        .expect(402);

      expect(response.body.error).toBe('payment_already_used');
    });

    it('should return 402 for invalid payment verification', async () => {
      // Create payment invoice
      const paymentId = 'test-payment-invalid';
      paymentStore.create(paymentId, { amount: '0.001' });

      verifyPayment.mockResolvedValue({
        valid: false,
        reason: 'Insufficient amount',
      });

      const paymentPayload = {
        txSignature: '5j7s8K9L1mN2oP3qR4tU5vW6xY7zA8bC9dE0fG1hI2jK3lM4nO5pQ6rS7tU8vW9x',
        paymentId,
      };

      const base64Payment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

      const response = await request(app)
        .post('/')
        .set('X-Payment', base64Payment)
        .send({ jsonrpc: '2.0', id: 1, method: 'getBlock', params: [14000000] })
        .expect(402);

      expect(response.body.error).toBe('payment_invalid');
      expect(response.body.details).toBe('Insufficient amount');
    });

    it('should still return data if settlement fails (non-blocking)', async () => {
      // Create payment invoice
      const paymentId = 'test-payment-settle-fail';
      paymentStore.create(paymentId, { amount: '0.001' });

      const mockRpcResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: { blockhash: 'test-hash' },
      };

      verifyPayment.mockResolvedValue({ valid: true });
      settlePayment.mockRejectedValue(new Error('Settlement service unavailable'));
      fetchFromOldFaithful.mockResolvedValue(mockRpcResponse);

      const paymentPayload = {
        txSignature: '5j7s8K9L1mN2oP3qR4tU5vW6xY7zA8bC9dE0fG1hI2jK3lM4nO5pQ6rS7tU8vW9x',
        paymentId,
      };

      const base64Payment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

      const response = await request(app)
        .post('/')
        .set('X-Payment', base64Payment)
        .send({ jsonrpc: '2.0', id: 1, method: 'getBlock', params: [14000000] })
        .expect(200);

      expect(response.body).toEqual(mockRpcResponse);

      // Check X-Payment-Response header
      const paymentResponse = JSON.parse(
        Buffer.from(response.headers['x-payment-response'], 'base64').toString('utf8')
      );
      expect(paymentResponse.settled).toBe(false);
    });
  });

  describe('POST / - Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Make 101 requests to trigger rate limit
      const requests = [];
      for (let i = 0; i < 101; i++) {
        requests.push(
          request(app).post('/').send({
            jsonrpc: '2.0',
            id: i,
            method: 'getBlock',
            params: [14000000],
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponse = responses.find((res) => res.status === 429);

      expect(rateLimitedResponse).toBeDefined();
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      // Create a new app instance to avoid rate limit issues
      jest.resetModules();
      const freshApp = require('../../src/app');
      
      const response = await request(freshApp)
        .get('/unknown-route')
        .expect(404);

      expect(response.body.error).toBe('not_found');
    });
  });
});
