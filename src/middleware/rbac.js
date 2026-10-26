import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required before role check'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Forbidden: Action requires one of the following roles: [${allowedRoles.join(', ')}]`)
      );
    }

    next();
  };
}
