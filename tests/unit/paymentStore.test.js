const { PaymentStore } = require('../../src/stores/paymentStore');

describe('PaymentStore', () => {
  let store;

  beforeEach(() => {
    store = new PaymentStore();
  });

  afterEach(() => {
    // Clear all intervals
    if (store.cleanupInterval) {
      clearInterval(store.cleanupInterval);
    }
  });

  describe('create', () => {
    it('should create a new payment invoice', () => {
      const paymentId = 'test-payment-123';
      const data = {
        amount: '0.001',
        createdAt: Date.now(),
        used: false,
      };

      store.create(paymentId, data);
      const invoice = store.get(paymentId);

      expect(invoice).toBeDefined();
      expect(invoice.amount).toBe('0.001');
      expect(invoice.used).toBe(false);
    });

    it('should set default createdAt if not provided', () => {
      const paymentId = 'test-payment-456';
      const data = {
        amount: '0.001',
      };

      store.create(paymentId, data);
      const invoice = store.get(paymentId);

      expect(invoice.createdAt).toBeDefined();
      expect(typeof invoice.createdAt).toBe('number');
    });
  });

  describe('get', () => {
    it('should retrieve an existing invoice', () => {
      const paymentId = 'test-payment-789';
      store.create(paymentId, { amount: '0.001' });

      const invoice = store.get(paymentId);
      expect(invoice).toBeDefined();
      expect(invoice.amount).toBe('0.001');
    });

    it('should return undefined for non-existent invoice', () => {
      const invoice = store.get('non-existent-id');
      expect(invoice).toBeUndefined();
    });
  });

  describe('markAsUsed', () => {
    it('should mark an invoice as used', () => {
      const paymentId = 'test-payment-used';
      store.create(paymentId, { amount: '0.001' });

      store.markAsUsed(paymentId);
      const invoice = store.get(paymentId);

      expect(invoice.used).toBe(true);
      expect(invoice.usedAt).toBeDefined();
    });

    it('should not throw error for non-existent invoice', () => {
      expect(() => {
        store.markAsUsed('non-existent-id');
      }).not.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete an invoice', () => {
      const paymentId = 'test-payment-delete';
      store.create(paymentId, { amount: '0.001' });

      store.delete(paymentId);
      const invoice = store.get(paymentId);

      expect(invoice).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should remove expired invoices', () => {
      const oldPaymentId = 'old-payment';
      const newPaymentId = 'new-payment';

      // Create old invoice (16 minutes ago)
      const oldTime = Date.now() - (16 * 60 * 1000);
      store.create(oldPaymentId, { amount: '0.001', createdAt: oldTime });

      // Create new invoice
      store.create(newPaymentId, { amount: '0.001' });

      store.cleanup();

      expect(store.get(oldPaymentId)).toBeUndefined();
      expect(store.get(newPaymentId)).toBeDefined();
    });

    it('should not remove recent invoices', () => {
      const paymentId = 'recent-payment';
      store.create(paymentId, { amount: '0.001' });

      store.cleanup();

      expect(store.get(paymentId)).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      store.create('payment-1', { amount: '0.001' });
      store.create('payment-2', { amount: '0.001' });
      store.create('payment-3', { amount: '0.001' });

      store.markAsUsed('payment-1');
      store.markAsUsed('payment-2');

      const stats = store.getStats();

      expect(stats.total).toBe(3);
      expect(stats.used).toBe(2);
      expect(stats.unused).toBe(1);
    });

    it('should return zero stats for empty store', () => {
      const stats = store.getStats();

      expect(stats.total).toBe(0);
      expect(stats.used).toBe(0);
      expect(stats.unused).toBe(0);
    });
  });
});
