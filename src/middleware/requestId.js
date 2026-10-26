import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim() ? incomingId : uuidv4();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}
