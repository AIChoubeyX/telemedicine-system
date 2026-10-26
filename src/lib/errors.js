export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = null) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class SlotUnavailableError extends AppError {
  constructor(message = 'The requested availability slot is no longer available') {
    super(message, 409, 'SLOT_UNAVAILABLE');
  }
}

export class IdempotencyPayloadMismatchError extends AppError {
  constructor(message = 'Idempotency key reuse with different payload is not permitted') {
    super(message, 422, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
  }
}

export class IdempotencyInProgressError extends AppError {
  constructor(message = 'A request with this idempotency key is currently being processed') {
    super(message, 409, 'IDEMPOTENCY_IN_PROGRESS');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}
