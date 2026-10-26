import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { cache } from './lib/redis.js';

async function startServer() {
  try {
    // 1. Verify database connection
    await prisma.$connect();
    logger.info('Database connection established successfully');

    // 2. Create Express app
    const app = createApp();

    // 3. Bind HTTP server
    const server = app.listen(env.PORT, () => {
      logger.info(
        {
          port: env.PORT,
          env: env.NODE_ENV,
          apiDocs: `http://localhost:${env.PORT}/docs`,
          healthCheck: `http://localhost:${env.PORT}/health`
        },
        '🚀 Amrutam Telemedicine Backend is running'
      );
    });

    // 4. Graceful shutdown handler
    const gracefulShutdown = async (signal) => {
      logger.info({ signal }, 'Received termination signal. Starting graceful shutdown...');

      server.close(async () => {
        logger.info('HTTP server closed. Releasing active connections...');

        try {
          await prisma.$disconnect();
          logger.info('Database disconnected.');

          await cache.disconnect();
          logger.info('Cache disconnected.');

          logger.info('Graceful shutdown completed successfully.');
          process.exit(0);
        } catch (err) {
          logger.error({ error: err.message }, 'Error occurred during cleanup');
          process.exit(1);
        }
      });

      // Force exit if cleanup takes longer than 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown: Timed out waiting for connections to close.');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('unhandledRejection', (reason, promise) => {
      logger.fatal({ reason, promise }, 'Unhandled Rejection at Promise');
    });

    process.on('uncaughtException', (error) => {
      logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught Exception thrown');
      process.exit(1);
    });
  } catch (err) {
    logger.fatal({ error: err.message, stack: err.stack }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
