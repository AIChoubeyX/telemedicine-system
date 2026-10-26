import { prisma } from '../../lib/prisma.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError
} from '../../lib/errors.js';
import { AuditService } from '../audit/audit.service.js';

const ALLOWED_TRANSITIONS = {
  BOOKED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};

export class ConsultationsService {
  /**
   * Update consultation status through valid lifecycle transitions
   */
  static async updateStatus(consultationId, { status: newStatus, notes, cancellationReason }, user) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { slot: true }
    });

    if (!consultation) {
      throw new NotFoundError('Consultation not found');
    }

    // Role and ownership enforcement
    if (user.role === 'DOCTOR') {
      if (!user.doctor || consultation.doctorId !== user.doctor.id) {
        throw new ForbiddenError('You are not authorized to update this consultation');
      }
    } else if (user.role === 'PATIENT') {
      // Patients can only cancel their own BOOKED consultation
      if (consultation.patientId !== user.id) {
        throw new ForbiddenError('You are not authorized to update this consultation');
      }
      if (newStatus !== 'CANCELLED') {
        throw new ForbiddenError('Patients are only permitted to request consultation cancellation');
      }
    } else if (user.role !== 'ADMIN') {
      throw new ForbiddenError('Unauthorized role for consultation lifecycle updates');
    }

    // State machine check
    const allowed = ALLOWED_TRANSITIONS[consultation.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new ConflictError(
        `Invalid consultation state transition from '${consultation.status}' to '${newStatus}'. Allowed next states: [${allowed.join(', ')}]`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updateData = {
        status: newStatus,
        notes: notes !== undefined ? notes : consultation.notes
      };

      if (newStatus === 'CANCELLED') {
        updateData.cancelledAt = new Date();
        updateData.cancellationReason = cancellationReason || 'Cancelled by user/provider';

        // Re-release slot to AVAILABLE
        await tx.availabilitySlot.update({
          where: { id: consultation.slotId },
          data: { status: 'AVAILABLE' }
        });

        // Refund payment if was paid
        const payment = await tx.payment.findUnique({
          where: { consultationId }
        });
        if (payment && payment.status === 'PAID') {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'REFUNDED' }
          });
        }
      }

      const res = await tx.consultation.update({
        where: { id: consultationId },
        data: updateData,
        include: {
          doctor: {
            include: {
              user: { select: { email: true, profile: true } }
            }
          },
          patient: {
            select: { id: true, email: true, profile: true }
          },
          slot: true
        }
      });

      await AuditService.log({
        userId: user.id,
        action: 'CONSULTATION_STATUS_CHANGED',
        entityType: 'Consultation',
        entityId: consultationId,
        details: { fromStatus: consultation.status, toStatus: newStatus, notes },
        tx
      });

      return res;
    });

    return updated;
  }
}
