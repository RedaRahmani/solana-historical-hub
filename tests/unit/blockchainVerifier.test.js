// Mock @solana/web3.js before importing anything
jest.mock('@solana/web3.js', () => {
  const mockConnection = {
    getTransaction: jest.fn(),
  };
  
  return {
    Connection: jest.fn(() => mockConnection),
    PublicKey: jest.fn((key) => ({ toBase58: () => key, toString: () => key })),
    __mockConnection: mockConnection, // Export for access in tests
  };
});

const { Connection, __mockConnection: mockConnection } = require('@solana/web3.js');
const { verifyPaymentOnChain } = require('../../src/services/blockchainVerifier');

describe('Blockchain Verifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyPaymentOnChain', () => {
    const mockParams = {
      txSignature: '5j7s8K9L1mN2oP3qR4tU5vW6xY7zA8bC9dE0fG1hI2jK3lM4nO5pQ6rS7tU8vW9x',
      paymentId: 'test-payment-id',
      expectedAmount: '0.001',
      mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
      recipient: 'testWallet123456789',
    };

    it('should verify valid on-chain payment', async () => {
      const mockTransaction = {
        meta: {
          err: null,
          preTokenBalances: [
            {
              accountIndex: 2,
              mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
              uiTokenAmount: {
                amount: '1000000',
                decimals: 6,
              },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 2,
              mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
              uiTokenAmount: {
                amount: '1001000', // +0.001 USDC (1000 lamports)
                decimals: 6,
              },
            },
          ],
        },
        transaction: {
          message: {
            getAccountKeys: jest.fn().mockReturnValue({
              get: jest.fn().mockReturnValue({ toBase58: () => 'testWallet123456789' }),
            }),
          },
        },
      };

      mockConnection.getTransaction.mockResolvedValue(mockTransaction);

      const result = await verifyPaymentOnChain(mockParams);

      expect(result.valid).toBe(true);
      expect(mockConnection.getTransaction).toHaveBeenCalledWith(
        mockParams.txSignature,
        expect.objectContaining({
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        })
      );
    });

    it('should reject if transaction not found', async () => {
      mockConnection.getTransaction.mockResolvedValue(null);

      const result = await verifyPaymentOnChain(mockParams);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Transaction not found');
    });

    it('should reject if transaction failed on chain', async () => {
      const mockTransaction = {
        meta: {
          err: { InstructionError: [0, 'CustomError'] },
        },
      };

      mockConnection.getTransaction.mockResolvedValue(mockTransaction);

      const result = await verifyPaymentOnChain(mockParams);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Transaction failed on chain');
    });

    it('should reject if no token balances found', async () => {
      const mockTransaction = {
        meta: {
          err: null,
          preTokenBalances: null,
          postTokenBalances: null,
        },
      };

      mockConnection.getTransaction.mockResolvedValue(mockTransaction);

      const result = await verifyPaymentOnChain(mockParams);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('No token balance changes found');
    });

    it('should reject if amount does not match', async () => {
      const mockTransaction = {
        meta: {
          err: null,
          preTokenBalances: [
            {
              accountIndex: 2,
              mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
              uiTokenAmount: {
                amount: '1000000',
                decimals: 6,
              },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 2,
              mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
              uiTokenAmount: {
                amount: '1000500', // Only +0.0005 USDC (wrong amount)
                decimals: 6,
              },
            },
          ],
        },
        transaction: {
          message: {
            getAccountKeys: jest.fn().mockReturnValue({
              get: jest.fn().mockReturnValue({ toBase58: () => 'testWallet123456789' }),
            }),
          },
        },
      };

      mockConnection.getTransaction.mockResolvedValue(mockTransaction);

      const result = await verifyPaymentOnChain(mockParams);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('No valid USDC transfer');
    });

    it('should handle connection errors gracefully', async () => {
      mockConnection.getTransaction.mockRejectedValue(new Error('RPC connection failed'));

      const result = await verifyPaymentOnChain(mockParams);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('On-chain verification failed');
    });
  });
});
