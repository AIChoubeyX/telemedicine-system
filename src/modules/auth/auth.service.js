import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import {
  ConflictError,
  UnauthorizedError
} from '../../lib/errors.js';
import { AuditService } from '../audit/audit.service.js';

export class AuthService {
  /**
   * Helper to generate JWT access and refresh tokens
   */
  static generateTokens(user) {
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      {
        sub: user.id,
        tokenType: 'refresh'
      },
      env.REFRESH_TOKEN_SECRET,
      { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Register a new patient
   */
  static async registerPatient(data, reqMeta = {}) {
    const { email, password, firstName, lastName, phone, dateOfBirth, gender, address } = data;

    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const parsedDob = dateOfBirth ? new Date(dateOfBirth) : null;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'PATIENT', // Explicitly enforced: public registration CANNOT create DOCTOR or ADMIN
          isActive: true,
          profile: {
            create: {
              firstName,
              lastName,
              phone: phone || null,
              dateOfBirth: parsedDob,
              gender: gender || null,
              address: address || null
            }
          }
        },
        include: {
          profile: true
        }
      });

      await AuditService.log({
        userId: user.id,
        action: 'AUTH_REGISTER',
        entityType: 'User',
        entityId: user.id,
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
        details: { email: user.email, role: user.role },
        tx
      });

      return user;
    });

    const tokens = this.generateTokens(result);

    return {
      user: {
        id: result.id,
        email: result.email,
        role: result.role,
        profile: result.profile
      },
      ...tokens
    };
  }

  /**
   * Login user with email & password
   */
  static async login({ email, password }, reqMeta = {}) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
        doctor: true
      }
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('This account has been deactivated. Please contact support.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const tokens = this.generateTokens(user);

    await AuditService.log({
      userId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: user.profile,
        doctor: user.doctor
      },
      ...tokens
    };
  }

  /**
   * Exchange valid refresh token for a new access token
   */
  static async refreshToken(refreshToken) {
    let payload;
    try {
      payload = jwt.verify(refreshToken, env.REFRESH_TOKEN_SECRET);
    } catch {
      throw new UnauthorizedError('Refresh token is invalid or expired');
    }

    if (!payload.sub || payload.tokenType !== 'refresh') {
      throw new UnauthorizedError('Malformed refresh token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User account not found or deactivated');
    }

    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return { accessToken };
  }

  /**
   * Get user profile details
   */
  static async getMe(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        profile: true,
        doctor: true
      }
    });

    if (!user) {
      throw new UnauthorizedError('User profile not found');
    }

    return user;
  }
}
