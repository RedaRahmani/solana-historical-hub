const logger = require('../utils/logger');
const Redis = require('ioredis');

/**
 * Payment store with Redis persistence and automatic fallback to in-memory Map
 * Supports clustering and persistence while maintaining resilience
 */
class PaymentStore {
  constructor() {
    this.invoices = new Map(); // In-memory fallback
    this.cleanupInterval = 15 * 60 * 1000; // 15 minutes
    this.redis = null;
    this.useRedis = false;

    // Try to connect to Redis
    this.initRedis();

    // Auto-cleanup expired invoices
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  /**
   * Initialize Redis connection with automatic fallback
   */
  async initRedis() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    try {
      this.redis = new Redis(redisUrl, {
        retryStrategy: (times) => {
          // Stop retrying after 3 attempts
          if (times > 3) {
            logger.warn('Redis connection failed after 3 attempts, using in-memory fallback');
            return null;
          }
          return Math.min(times * 100, 2000);
        },
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
      });

      this.redis.on('connect', () => {
        logger.info('Redis connected successfully');
        this.useRedis = true;
      });

      this.redis.on('error', (err) => {
        logger.warn(`Redis error: ${err.message}, falling back to in-memory store`);
        this.useRedis = false;
      });

      this.redis.on('close', () => {
        logger.warn('Redis connection closed, using in-memory fallback');
        this.useRedis = false;
      });

      // Test connection
      await this.redis.ping();
      this.useRedis = true;
      logger.info('PaymentStore: Using Redis for persistence');
    } catch (error) {
      logger.warn(`Failed to initialize Redis: ${error.message}, using in-memory fallback`);
      this.useRedis = false;
      this.redis = null;
    }
  }

  /**
   * Create a new payment invoice
   * @param {string} paymentId - Unique payment ID
   * @param {Object} data - Invoice data
   */
  async create(paymentId, data) {
    const invoice = {
      ...data,
      createdAt: data.createdAt || Date.now(),
      used: false,
    };

    // Try Redis first
    if (this.useRedis && this.redis) {
      try {
        await this.redis.setex(
          `payment:${paymentId}`,
          900, // 15 minutes TTL
          JSON.stringify(invoice)
        );
        logger.debug(`Payment invoice created in Redis: ${paymentId}`);
        return;
      } catch (error) {
        logger.warn(`Redis create failed: ${error.message}, using fallback`);
        this.useRedis = false;
      }
    }

    // Fallback to in-memory
    this.invoices.set(paymentId, invoice);
    logger.debug(`Payment invoice created in memory: ${paymentId}`);
  }

  /**
   * Get payment invoice by ID
   * @param {string} paymentId
   * @returns {Object|undefined}
   */
  async get(paymentId) {
    // Try Redis first
    if (this.useRedis && this.redis) {
      try {
        const data = await this.redis.get(`payment:${paymentId}`);
        if (data) {
          return JSON.parse(data);
        }
        return undefined;
      } catch (error) {
        logger.warn(`Redis get failed: ${error.message}, using fallback`);
        this.useRedis = false;
      }
    }

    // Fallback to in-memory
    return this.invoices.get(paymentId);
  }

  /**
   * Mark payment as used
   * @param {string} paymentId
   */
  async markAsUsed(paymentId) {
    // Try Redis first
    if (this.useRedis && this.redis) {
      try {
        const data = await this.redis.get(`payment:${paymentId}`);
        if (data) {
          const invoice = JSON.parse(data);
          invoice.used = true;
          invoice.usedAt = Date.now();
          await this.redis.setex(
            `payment:${paymentId}`,
            900, // Keep TTL
            JSON.stringify(invoice)
          );
          logger.debug(`Payment invoice marked as used in Redis: ${paymentId}`);
          return;
        }
      } catch (error) {
        logger.warn(`Redis markAsUsed failed: ${error.message}, using fallback`);
        this.useRedis = false;
      }
    }

    // Fallback to in-memory
    const invoice = this.invoices.get(paymentId);
    if (invoice) {
      invoice.used = true;
      invoice.usedAt = Date.now();
      logger.debug(`Payment invoice marked as used in memory: ${paymentId}`);
    }
  }

  /**
   * Delete payment invoice
   * @param {string} paymentId
   */
  async delete(paymentId) {
    // Try Redis first
    if (this.useRedis && this.redis) {
      try {
        await this.redis.del(`payment:${paymentId}`);
        return;
      } catch (error) {
        logger.warn(`Redis delete failed: ${error.message}, using fallback`);
        this.useRedis = false;
      }
    }

    // Fallback to in-memory
    this.invoices.delete(paymentId);
  }

  /**
   * Clean up expired invoices (older than 15 minutes)
   * Only needed for in-memory store (Redis uses TTL)
   */
  cleanup() {
    if (this.useRedis) {
      // Redis handles expiry automatically with TTL
      return;
    }

    const now = Date.now();
    const expiryTime = 15 * 60 * 1000; // 15 minutes
    let cleanedCount = 0;

    for (const [paymentId, invoice] of this.invoices.entries()) {
      if (now - invoice.createdAt > expiryTime) {
        this.invoices.delete(paymentId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired payment invoices from memory`);
    }
  }

  /**
   * Get store statistics
   * @returns {Object}
   */
  async getStats() {
    let used = 0;
    let unused = 0;
    let total = 0;

    if (this.useRedis && this.redis) {
      try {
        const keys = await this.redis.keys('payment:*');
        total = keys.length;
        
        for (const key of keys) {
          const data = await this.redis.get(key);
          if (data) {
            const invoice = JSON.parse(data);
            if (invoice.used) {
              used++;
            } else {
              unused++;
            }
          }
        }
      } catch (error) {
        logger.warn(`Redis getStats failed: ${error.message}, using fallback`);
        this.useRedis = false;
      }
    }

    // Fallback to in-memory stats
    if (!this.useRedis) {
      total = this.invoices.size;
      for (const invoice of this.invoices.values()) {
        if (invoice.used) {
          used++;
        } else {
          unused++;
        }
      }
    }

    return {
      total,
      used,
      unused,
      backend: this.useRedis ? 'redis' : 'memory',
    };
  }
}

// Singleton instance
const paymentStore = new PaymentStore();

module.exports = { paymentStore, PaymentStore };
