import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'secret',
      'cardNumber',
      'cvv',
      'prescriptions',
      'medications',
      'diagnosis',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken'
    ],
    censor: '[REDACTED]'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    }
  }
});
