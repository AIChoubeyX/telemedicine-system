import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

class CacheService {
  constructor() {
    this.memoryStore = new Map();
    this.redisClient = null;
    this.isRedisAvailable = false;

    if (env.REDIS_URL && env.REDIS_URL.trim() !== '') {
      try {
        this.redisClient = new Redis(env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          retryStrategy(times) {
            if (times > 3) return null; // stop retrying after 3 attempts
            return Math.min(times * 100, 1000);
          }
        });

        this.redisClient.on('connect', () => {
          this.isRedisAvailable = true;
          logger.info('Connected to Redis cache');
        });

        this.redisClient.on('error', (err) => {
          this.isRedisAvailable = false;
          logger.warn({ error: err.message }, 'Redis connection error; operating in in-memory cache mode');
        });

        this.redisClient.connect().catch((err) => {
          this.isRedisAvailable = false;
          logger.warn({ error: err.message }, 'Failed to initiate Redis connection; operating in in-memory cache mode');
        });
      } catch (err) {
        this.isRedisAvailable = false;
        logger.warn({ error: err.message }, 'Redis initialization failed; using in-memory cache');
      }
    } else {
      logger.info('REDIS_URL not configured; operating in in-memory cache mode');
    }
  }

  async get(key) {
    if (this.isRedisAvailable && this.redisClient) {
      try {
        const val = await this.redisClient.get(key);
        return val ? JSON.parse(val) : null;
      } catch (err) {
        logger.warn({ error: err.message, key }, 'Redis GET failed, falling back to memory');
      }
    }
    const item = this.memoryStore.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.memoryStore.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key, value, ttlSeconds = 300) {
    if (this.isRedisAvailable && this.redisClient) {
      try {
        await this.redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return true;
      } catch (err) {
        logger.warn({ error: err.message, key }, 'Redis SET failed, falling back to memory');
      }
    }
    this.memoryStore.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
    });
    return true;
  }

  async del(key) {
    if (this.isRedisAvailable && this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch (err) {
        logger.warn({ error: err.message, key }, 'Redis DEL failed');
      }
    }
    this.memoryStore.delete(key);
    return true;
  }

  async disconnect() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch {
        // ignore disconnect errors
      }
    }
  }
}

export const cache = new CacheService();
