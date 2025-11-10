const axios = require('axios');
const FacilitatorClient = require('../../src/clients/facilitatorClient');

jest.mock('axios');

describe('FacilitatorClient', () => {
  let client;

  beforeEach(() => {
    client = new FacilitatorClient({
      verifyUrl: 'https://api.test.com/verify',
      settleUrl: 'https://api.test.com/settle',
    });
    jest.clearAllMocks();
  });

  describe('verifyPayment', () => {
    const mockPaymentParams = {
      txSignature: '5j7s8K9L1mN2oP3qR4tU5vW6xY7zA8bC9dE0fG1hI2jK3lM4nO5pQ6rS7tU8vW9x',
      paymentId: 'test-payment-id',
      expectedAmount: '0.001',
      mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
      recipient: 'testWallet123456789',
    };

    it('should verify payment successfully', async () => {
      const mockResponse = {
        data: {
          verified: true,
          status: 'success',
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await client.verifyPayment(mockPaymentParams);

      expect(result.valid).toBe(true);
      expect(result.raw).toEqual(mockResponse.data);
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.test.com/verify',
        expect.objectContaining({
          txSignature: mockPaymentParams.txSignature,
          paymentId: mockPaymentParams.paymentId,
        }),
        expect.any(Object)
      );
    });

    it('should handle verification failure', async () => {
      const mockResponse = {
        data: {
          verified: false,
          reason: 'Invalid amount',
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await client.verifyPayment(mockPaymentParams);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid amount');
    });

    it('should handle network errors', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      await expect(client.verifyPayment(mockPaymentParams)).rejects.toThrow('Network error');
    });

    it('should handle facilitator error responses', async () => {
      const errorResponse = {
        response: {
          data: {
            message: 'Payment not found',
          },
        },
      };

      axios.post.mockRejectedValue(errorResponse);

      const result = await client.verifyPayment(mockPaymentParams);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Payment not found');
    });

    it('should throw error if verifyUrl not configured', async () => {
      const clientWithoutUrl = new FacilitatorClient({
        verifyUrl: null,
        settleUrl: 'https://api.test.com/settle',
      });

      await expect(clientWithoutUrl.verifyPayment(mockPaymentParams)).rejects.toThrow(
        'Facilitator verify URL not configured'
      );
    });
  });

  describe('settlePayment', () => {
    const mockSettleParams = {
      txSignature: '5j7s8K9L1mN2oP3qR4tU5vW6xY7zA8bC9dE0fG1hI2jK3lM4nO5pQ6rS7tU8vW9x',
      paymentId: 'test-payment-id',
    };

    it('should settle payment successfully', async () => {
      const mockResponse = {
        data: {
          settled: true,
          settlementId: 'settlement-123',
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await client.settlePayment(mockSettleParams);

      expect(result.settled).toBe(true);
      expect(result.settlementId).toBe('settlement-123');
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.test.com/settle',
        expect.objectContaining({
          txSignature: mockSettleParams.txSignature,
          paymentId: mockSettleParams.paymentId,
        }),
        expect.any(Object)
      );
    });

    it('should throw error on settlement failure', async () => {
      axios.post.mockRejectedValue(new Error('Settlement failed'));

      await expect(client.settlePayment(mockSettleParams)).rejects.toThrow('Settlement failed');
    });

    it('should throw error if settleUrl not configured', async () => {
      const clientWithoutUrl = new FacilitatorClient({
        verifyUrl: 'https://api.test.com/verify',
        settleUrl: null,
      });

      await expect(clientWithoutUrl.settlePayment(mockSettleParams)).rejects.toThrow(
        'Facilitator settle URL not configured'
      );
    });
  });
});
