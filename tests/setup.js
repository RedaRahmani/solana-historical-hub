// Jest setup file
// Runs before each test suite

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.PAYMENT_WALLET_ADDRESS = 'testWallet123456789';
process.env.PRICE_PER_QUERY = '0.001';
process.env.USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.OLD_FAITHFUL_RPC_URL = 'http://localhost:8899';
process.env.FACILITATOR_VERIFY_URL = 'https://api.payai.network/verify';
process.env.FACILITATOR_SETTLE_URL = 'https://api.payai.network/settle';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
