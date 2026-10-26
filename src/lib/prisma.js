import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const connectionUrl = process.env.NODE_ENV === 'test' && env.TEST_DATABASE_URL
  ? env.TEST_DATABASE_URL
  : env.DATABASE_URL;

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: connectionUrl
    }
  },
  log: env.NODE_ENV === 'development'
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' }
      ]
    : [{ emit: 'event', level: 'error' }]
});

if (env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug({ query: e.query, duration: `${e.duration}ms` }, 'Database Query');
  });
}

prisma.$on('error', (e) => {
  logger.error({ error: e.message }, 'Database Error');
});
