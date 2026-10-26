import { prisma } from '../../lib/prisma.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError
} from '../../lib/errors.js';
import { MockPaymentGateway } from './mockPaymentGateway.js';
import { AuditService } from '../audit/audit.service.js';

export class PaymentsService {
  /**
   * Process a pending payment through mock gateway adapter
   */
  static async processPayment(paymentId, { paymentMethod }, user) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        consultation: true
      }
    });

    if (!payment) {
      throw new NotFoundError('Payment record not found');
    }

    // Ownership check
    if (user.role === 'PATIENT' && payment.patientId !== user.id) {
      throw new ForbiddenError('You are not authorized to process this payment');
    }

    // State transition validation
    if (payment.status === 'PAID') {
      throw new ConflictError('This payment has already been completed');
    }

    if (payment.status === 'REFUNDED') {
      throw new ConflictError('This payment was already refunded and cannot be processed again');
    }

    if (payment.consultation.status === 'CANCELLED') {
      throw new ConflictError('Cannot pay for a cancelled consultation');
    }

    // Call mock payment gateway
    const gatewayResponse = await MockPaymentGateway.processPayment({
      paymentId: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      paymentMethod
    });

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          paymentMethod,
          metadata: gatewayResponse
        }
      });

      await AuditService.log({
        userId: user.id,
        action: 'PAYMENT_PROCESSED',
        entityType: 'Payment',
        entityId: payment.id,
        details: {
          amount: Number(payment.amount),
          status: 'PAID',
          gatewayReference: gatewayResponse.gatewayReference
        },
        tx
      });

      return res;
    });

    return updated;
  }

  /**
   * Get single payment record with ownership check
   */
  static async getPaymentById(paymentId, user) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        consultation: {
          select: {
            id: true,
            consultationNumber: true,
            status: true
          }
        }
      }
    });

    if (!payment) {
      throw new NotFoundError('Payment record not found');
    }

    if (user.role === 'PATIENT' && payment.patientId !== user.id) {
      throw new ForbiddenError('You are not authorized to view this payment record');
    }

    return payment;
  }

  /**
   * List payments with pagination and status filtering
   */
  static async listPayments(user, { status, page = 1, limit = 20 }) {
    const where = {};
    if (user.role === 'PATIENT') {
      where.patientId = user.id;
    } // Admin can list all

    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * limit;

    const [total, payments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          consultation: {
            select: { id: true, consultationNumber: true }
          }
        }
      })
    ]);

    return {
      data: payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
