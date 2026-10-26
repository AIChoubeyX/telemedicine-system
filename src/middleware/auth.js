import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export async function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token is missing or malformed');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('Authentication token is missing');
    }

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Authentication token has expired');
      }
      throw new UnauthorizedError('Authentication token is invalid');
    }

    if (!payload.sub) {
      throw new UnauthorizedError('Token payload is missing subject');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        profile: true,
        doctor: true
      }
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User account is invalid or deactivated');
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      profile: user.profile,
      doctor: user.doctor
    };

    next();
  } catch (err) {
    next(err);
  }
}
