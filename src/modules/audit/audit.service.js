import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

export class AuditService {
  /**
   * Record an audit event
   */
  static async log({
    userId = null,
    action,
    entityType,
    entityId = null,
    ipAddress = null,
    userAgent = null,
    details = null,
    tx = null
  }) {
    try {
      const client = tx || prisma;
      return await client.auditLog.create({
        data: {
          userId,
          action,
          entityType,
          entityId: entityId ? String(entityId) : null,
          ipAddress,
          userAgent,
          details: details ? details : undefined
        }
      });
    } catch (err) {
      logger.error({ error: err.message, action, entityType }, 'Failed to write audit log');
      // Do not let audit log failure break the main business transaction unless strictly required
      return null;
    }
  }

  /**
   * Query audit logs with pagination and filters
   */
  static async queryLogs({
    userId,
    action,
    entityType,
    startDate,
    endDate,
    page = 1,
    limit = 20
  }) {
    const where = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true
            }
          }
        }
      })
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
