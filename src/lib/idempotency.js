import crypto from 'crypto';
import { prisma } from './prisma.js';
import {
  IdempotencyPayloadMismatchError,
  IdempotencyInProgressError,
  BadRequestError
} from './errors.js';

export function hashPayload(payload) {
  if (!payload || Object.keys(payload).length === 0) {
    return crypto.createHash('sha256').update('{}').digest('hex');
  }
  // Sort keys for canonical representation
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

export class IdempotencyService {
  /**
   * Acquire or check an idempotency key
   * @returns {{ isReplay: boolean, responseCode?: number, responseBody?: any }}
   */
  static async acquire({ userId, key, path, method, payload }) {
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      throw new BadRequestError('Idempotency-Key header is required for this operation');
    }

    const payloadHash = hashPayload(payload);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour key retention policy

    // 1. Check if key already exists
    const existing = await prisma.idempotencyKey.findUnique({
      where: {
        userId_key: {
          userId,
          key
        }
      }
    });

    if (existing) {
      // Check if expired
      if (new Date() > new Date(existing.expiresAt)) {
        // Purge expired key and allow re-use
        await prisma.idempotencyKey.delete({ where: { id: existing.id } });
      } else {
        // Validate payload hash
        if (existing.requestPayloadHash !== payloadHash) {
          throw new IdempotencyPayloadMismatchError(
            'Idempotency key has already been used with a different request payload'
          );
        }

        if (existing.status === 'IN_PROGRESS') {
          throw new IdempotencyInProgressError();
        }

        if (existing.status === 'COMPLETED') {
          return {
            isReplay: true,
            responseCode: existing.responseCode,
            responseBody: existing.responseBody
          };
        }
      }
    }

    // 2. Insert new in-progress record
    try {
      await prisma.idempotencyKey.create({
        data: {
          userId,
          key,
          requestPath: path,
          requestMethod: method,
          requestPayloadHash: payloadHash,
          status: 'IN_PROGRESS',
          expiresAt
        }
      });

      return { isReplay: false };
    } catch (err) {
      // If unique constraint violation caught during concurrent race
      if (err.code === 'P2002') {
        const raceExisting = await prisma.idempotencyKey.findUnique({
          where: {
            userId_key: {
              userId,
              key
            }
          }
        });

        if (raceExisting) {
          if (raceExisting.requestPayloadHash !== payloadHash) {
            throw new IdempotencyPayloadMismatchError();
          }
          if (raceExisting.status === 'COMPLETED') {
            return {
              isReplay: true,
              responseCode: raceExisting.responseCode,
              responseBody: raceExisting.responseBody
            };
          }
        }
        throw new IdempotencyInProgressError();
      }
      throw err;
    }
  }

  /**
   * Complete the idempotency record with outcome
   */
  static async complete({ userId, key, responseCode, responseBody, tx }) {
    const client = tx || prisma;
    await client.idempotencyKey.update({
      where: {
        userId_key: {
          userId,
          key
        }
      },
      data: {
        status: 'COMPLETED',
        responseCode,
        responseBody
      }
    });
  }

  /**
   * Fail / release the idempotency record on rollback/error
   */
  static async fail({ userId, key }) {
    try {
      await prisma.idempotencyKey.delete({
        where: {
          userId_key: {
            userId,
            key
          }
        }
      });
    } catch {
      // Ignore cleanup error if already removed
    }
  }
}
