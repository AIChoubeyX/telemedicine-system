import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { cache } from '../lib/redis.js';
import { metrics } from './metrics.js';

const router = Router();

// Liveness probe
router.get('/health', (_req, res) => {
  return res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString()
  });
});

// Readiness probe (verifies database readiness)
router.get('/ready', async (_req, res) => {
  try {
    // Ping PostgreSQL
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      status: 'READY',
      checks: {
        database: 'CONNECTED',
        cache: cache.isRedisAvailable ? 'REDIS' : 'IN_MEMORY'
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(503).json({
      status: 'NOT_READY',
      checks: {
        database: 'DISCONNECTED',
        error: err.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics endpoint
router.get('/metrics', (_req, res) => {
  return res.status(200).json({
    status: 'UP',
    metrics: metrics.getMetrics(),
    timestamp: new Date().toISOString()
  });
});

export default router;
