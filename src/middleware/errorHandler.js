import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export function errorHandler(err, req, res, _next) {
  const requestId = req.id || 'unknown';

  // Handle custom AppError
  if (err instanceof AppError) {
    logger.warn({
      requestId,
      errCode: err.code,
      message: err.message,
      statusCode: err.statusCode,
      path: req.originalUrl,
      method: req.method
    }, 'Application Error');

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details || null
      },
      requestId
    });
  }

  // Handle Zod Validation Error
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
      rule: i.code
    }));

    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data provided',
        details: issues
      },
      requestId
    });
  }

  // Handle Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target || 'field';
      return res.status(409).json({
        success: false,
        error: {
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: `A record with this ${target} already exists`
        },
        requestId
      });
    }

    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Requested record was not found in the database'
        },
        requestId
      });
    }
  }

  // Handle JWT errors
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired. Please log in again.'
      },
      requestId
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token provided.'
      },
      requestId
    });
  }

  // Handle Body Parsing / Syntax Error
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MALFORMED_JSON',
        message: 'Request body contains invalid JSON syntax.'
      },
      requestId
    });
  }

  // Unexpected internal server error
  logger.error({
    requestId,
    error: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  }, 'Unhandled Internal Server Error');

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred. Please contact support.'
    },
    requestId
  });
}
