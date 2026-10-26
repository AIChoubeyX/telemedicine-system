import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import yaml from 'yaml';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { NotFoundError } from './lib/errors.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { globalRateLimiter } from './middleware/rateLimiter.js';
import { metrics } from './observability/metrics.js';

// Route imports
import healthRouter from './observability/health.routes.js';
import authRouter from './modules/auth/auth.routes.js';
import doctorsRouter from './modules/doctors/doctors.routes.js';
import availabilityRouter from './modules/availability/availability.routes.js';
import bookingsRouter from './modules/bookings/bookings.routes.js';
import consultationsRouter from './modules/consultations/consultations.routes.js';
import prescriptionsRouter from './modules/prescriptions/prescriptions.routes.js';
import paymentsRouter from './modules/payments/payments.routes.js';
import adminRouter from './modules/admin/admin.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  // 1. Trust proxy for rate limiting / secure headers behind reverse proxy
  app.set('trust proxy', 1);

  // 2. Security HTTP headers
  app.use(helmet());

  // 3. CORS configuration
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-ID']
    })
  );

  // 4. Request size limit & JSON parser
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 5. Correlation / Request ID
  app.use(requestIdMiddleware);

  // 6. Metrics tracking
  app.use(metrics.middleware());

  // 7. Structured HTTP logging with Pino
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (res, err) => {
        if (res.statusCode >= 500 || err) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customProps: (req) => ({
        requestId: req.id
      }),
      autoLogging: {
        ignore: (req) =>
          req.url === '/health' ||
          req.url === '/ready' ||
          req.url === '/metrics'
      }
    })
  );

  // 8. Global rate limiter
  app.use(globalRateLimiter);

  // 9. Health & metrics endpoints (unversioned for container probes)
  app.use('/', healthRouter);

  // 10. Swagger UI OpenAPI 3.1 documentation
  try {
    const openApiPath = path.resolve(__dirname, '../openapi.yaml');
    if (fs.existsSync(openApiPath)) {
      const openApiSpec = yaml.parse(fs.readFileSync(openApiPath, 'utf8'));
      app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
      app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
    }
  } catch (err) {
    logger.warn({ error: err.message }, 'Failed to load OpenAPI specification file');
  }

  // 11. API v1 Router
  const apiV1Router = express.Router();
  apiV1Router.use('/auth', authRouter);
  apiV1Router.use('/doctors', doctorsRouter);
  apiV1Router.use('/availability', availabilityRouter);
  apiV1Router.use('/bookings', bookingsRouter);
  apiV1Router.use('/consultations', consultationsRouter);
  apiV1Router.use('/prescriptions', prescriptionsRouter);
  apiV1Router.use('/payments', paymentsRouter);
  apiV1Router.use('/admin', adminRouter);

  app.use('/api/v1', apiV1Router);

  // 12. Catch 404 for unknown endpoints
  app.use((req, _res, next) => {
    next(new NotFoundError(`Endpoint '${req.method} ${req.originalUrl}' does not exist`));
  });

  // 13. Centralized error handling
  app.use(errorHandler);

  return app;
}
