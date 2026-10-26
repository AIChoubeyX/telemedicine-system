import { prisma } from '../../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { AuditService } from '../audit/audit.service.js';

export class AdminService {
  /**
   * Analytics overview with database aggregation
   */
  static async getOverviewAnalytics({ startDate, endDate }) {
    const consultationWhere = {};
    const paymentWhere = {};

    if (startDate || endDate) {
      consultationWhere.createdAt = {};
      paymentWhere.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);
        consultationWhere.createdAt.gte = start;
        paymentWhere.createdAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        consultationWhere.createdAt.lte = end;
        paymentWhere.createdAt.lte = end;
      }
    }

    // 1. Consultation counts grouped by status
    const consultationCounts = await prisma.consultation.groupBy({
      by: ['status'],
      where: consultationWhere,
      _count: {
        id: true
      }
    });

    const consultationsByStatus = {
      BOOKED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0
    };
    let totalConsultations = 0;
    for (const group of consultationCounts) {
      consultationsByStatus[group.status] = group._count.id;
      totalConsultations += group._count.id;
    }

    // 2. Payments aggregation
    const paymentCounts = await prisma.payment.groupBy({
      by: ['status'],
      where: paymentWhere,
      _count: {
        id: true
      },
      _sum: {
        amount: true
      }
    });

    const paymentsByStatus = {
      PENDING: { count: 0, totalAmount: 0 },
      PAID: { count: 0, totalAmount: 0 },
      FAILED: { count: 0, totalAmount: 0 },
      REFUNDED: { count: 0, totalAmount: 0 }
    };

    let totalRevenue = 0;
    for (const group of paymentCounts) {
      const sum = group._sum.amount ? Number(group._sum.amount) : 0;
      paymentsByStatus[group.status] = {
        count: group._count.id,
        totalAmount: sum
      };
      if (group.status === 'PAID') {
        totalRevenue = sum;
      }
    }

    // 3. User distribution
    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      _count: {
        id: true
      }
    });

    const userCounts = {
      PATIENT: 0,
      DOCTOR: 0,
      ADMIN: 0
    };
    for (const group of usersByRole) {
      userCounts[group.role] = group._count.id;
    }

    return {
      consultations: {
        total: totalConsultations,
        byStatus: consultationsByStatus
      },
      payments: {
        totalRevenue,
        byStatus: paymentsByStatus
      },
      users: userCounts
    };
  }

  /**
   * Doctor utilization metrics using aggregation
   */
  static async getDoctorUtilization() {
    const doctors = await prisma.doctor.findMany({
      where: { isVerified: true },
      include: {
        user: {
          select: {
            email: true,
            profile: {
              select: { firstName: true, lastName: true }
            }
          }
        },
        _count: {
          select: {
            availabilitySlots: true,
            consultations: true
          }
        }
      }
    });

    const utilization = await Promise.all(
      doctors.map(async (doc) => {
        const [completedCount, cancelledCount] = await Promise.all([
          prisma.consultation.count({
            where: { doctorId: doc.id, status: 'COMPLETED' }
          }),
          prisma.consultation.count({
            where: { doctorId: doc.id, status: 'CANCELLED' }
          })
        ]);

        const totalSlots = doc._count.availabilitySlots;
        const totalBookings = doc._count.consultations;
        const utilizationRate =
          totalSlots > 0 ? Number(((totalBookings / totalSlots) * 100).toFixed(2)) : 0;

        return {
          doctorId: doc.id,
          doctorName: doc.user?.profile
            ? `${doc.user.profile.firstName} ${doc.user.profile.lastName}`
            : 'Unknown',
          email: doc.user?.email,
          specialization: doc.specialization,
          totalSlotsCreated: totalSlots,
          totalBookings,
          completedConsultations: completedCount,
          cancelledConsultations: cancelledCount,
          utilizationRatePercent: utilizationRate
        };
      })
    );

    return utilization;
  }

  /**
   * Admin user management
   */
  static async listUsers({ role, isActive, page = 1, limit = 20 }) {
    const where = {};
    if (role) where.role = role;
    if (typeof isActive === 'boolean') where.isActive = isActive;

    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          profile: true,
          doctor: true
        }
      })
    ]);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Activate or deactivate user
   */
  static async updateUserStatus(targetUserId, isActive, adminUserId) {
    if (targetUserId === adminUserId) {
      throw new BadRequestError('Admin cannot deactivate their own account');
    }

    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        updatedAt: true
      }
    });

    await AuditService.log({
      userId: adminUserId,
      action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entityType: 'User',
      entityId: targetUserId,
      details: { previousStatus: user.isActive, newStatus: isActive }
    });

    return updated;
  }
}
