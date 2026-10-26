import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../lib/prisma.js';
import {
  NotFoundError,
  SlotUnavailableError,
  ForbiddenError,
  ConflictError,
  BadRequestError
} from '../../lib/errors.js';
import { IdempotencyService } from '../../lib/idempotency.js';
import { AuditService } from '../audit/audit.service.js';

export class BookingsService {
  /**
   * Atomic booking of an available slot with database-backed idempotency
   */
  static async bookSlot({ patientId, slotId, reason, idempotencyKey, reqPath, reqMethod, rawPayload }) {
    // 1. Acquire / verify idempotency key
    const acquireResult = await IdempotencyService.acquire({
      userId: patientId,
      key: idempotencyKey,
      path: reqPath,
      method: reqMethod,
      payload: rawPayload
    });

    if (acquireResult.isReplay) {
      return {
        isReplay: true,
        statusCode: acquireResult.responseCode || 200,
        body: acquireResult.responseBody
      };
    }

    try {
      // 2. Atomic transaction with row locking
      const result = await prisma.$transaction(async (tx) => {
        // Row lock using raw SQL FOR UPDATE
        const slots = await tx.$queryRaw`
          SELECT id, "doctorId", "startTime", "endTime", status
          FROM availability_slots
          WHERE id = ${slotId}
          FOR UPDATE
        `;

        const slot = slots && slots[0];
        if (!slot) {
          throw new NotFoundError('Availability slot not found');
        }

        if (slot.status !== 'AVAILABLE') {
          throw new SlotUnavailableError(
            'The requested availability slot has already been booked or is no longer available'
          );
        }

        const doctor = await tx.doctor.findUnique({
          where: { id: slot.doctorId }
        });

        if (!doctor || !doctor.isVerified) {
          throw new BadRequestError('Doctor is not eligible for bookings');
        }

        const consultationNumber = `CNS-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Create consultation
        const consultation = await tx.consultation.create({
          data: {
            consultationNumber,
            patientId,
            doctorId: slot.doctorId,
            slotId: slot.id,
            status: 'BOOKED',
            reason: reason || null
          },
          include: {
            doctor: {
              include: {
                user: {
                  select: { profile: true }
                }
              }
            },
            slot: true
          }
        });

        // Mark slot as BOOKED
        await tx.availabilitySlot.update({
          where: { id: slot.id },
          data: { status: 'BOOKED' }
        });

        // Create initial pending payment record
        const transactionRef = `TXN-${Date.now()}-${uuidv4().substring(0, 8)}`;
        const payment = await tx.payment.create({
          data: {
            consultationId: consultation.id,
            patientId,
            amount: doctor.consultationFee,
            currency: 'INR',
            status: 'PENDING',
            transactionRef,
            provider: 'MOCK_PAYMENT_GATEWAY'
          }
        });

        await AuditService.log({
          userId: patientId,
          action: 'BOOKING_CREATED',
          entityType: 'Consultation',
          entityId: consultation.id,
          details: {
            slotId,
            doctorId: slot.doctorId,
            consultationNumber,
            amount: doctor.consultationFee
          },
          tx
        });

        const responsePayload = {
          success: true,
          message: 'Slot booked successfully',
          data: {
            consultation: {
              id: consultation.id,
              consultationNumber: consultation.consultationNumber,
              status: consultation.status,
              reason: consultation.reason,
              createdAt: consultation.createdAt,
              doctor: {
                id: consultation.doctor.id,
                specialization: consultation.doctor.specialization,
                consultationFee: consultation.doctor.consultationFee,
                profile: consultation.doctor.user.profile
              },
              slot: {
                id: consultation.slot.id,
                startTime: consultation.slot.startTime,
                endTime: consultation.slot.endTime
              }
            },
            payment: {
              id: payment.id,
              amount: payment.amount,
              currency: payment.currency,
              status: payment.status,
              transactionRef: payment.transactionRef
            }
          }
        };

        // Complete idempotency inside transaction
        await IdempotencyService.complete({
          userId: patientId,
          key: idempotencyKey,
          responseCode: 201,
          responseBody: responsePayload,
          tx
        });

        return responsePayload;
      });

      return {
        isReplay: false,
        statusCode: 201,
        body: result
      };
    } catch (err) {
      // Release idempotency lock so client can safely retry on failure
      await IdempotencyService.fail({ userId: patientId, key: idempotencyKey });
      throw err;
    }
  }

  /**
   * List consultations for authenticated user (patient, doctor, or admin)
   */
  static async listBookings(user, { status, page = 1, limit = 20 }) {
    const where = {};

    if (user.role === 'PATIENT') {
      where.patientId = user.id;
    } else if (user.role === 'DOCTOR') {
      if (!user.doctor) {
        throw new ForbiddenError('Doctor profile missing');
      }
      where.doctorId = user.doctor.id;
    } // ADMIN can see all

    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * limit;

    const [total, consultations] = await Promise.all([
      prisma.consultation.count({ where }),
      prisma.consultation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          slot: true,
          doctor: {
            include: {
              user: {
                select: { email: true, profile: true }
              }
            }
          },
          patient: {
            select: { id: true, email: true, profile: true }
          },
          payment: true,
          prescription: true
        }
      })
    ]);

    return {
      data: consultations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single consultation with ownership check
   */
  static async getBookingById(consultationId, user) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        slot: true,
        doctor: {
          include: {
            user: { select: { email: true, profile: true } }
          }
        },
        patient: {
          select: { id: true, email: true, profile: true }
        },
        payment: true,
        prescription: true
      }
    });

    if (!consultation) {
      throw new NotFoundError('Consultation not found');
    }

    // RBAC ownership check
    if (user.role === 'PATIENT' && consultation.patientId !== user.id) {
      throw new ForbiddenError('You are not authorized to view this consultation');
    }

    if (user.role === 'DOCTOR' && (!user.doctor || consultation.doctorId !== user.doctor.id)) {
      throw new ForbiddenError('You are not authorized to view this consultation');
    }

    return consultation;
  }

  /**
   * Cancel booking according to business rules
   */
  static async cancelBooking(consultationId, cancellationReason, user) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { slot: true }
    });

    if (!consultation) {
      throw new NotFoundError('Consultation not found');
    }

    // Ownership check
    if (user.role === 'PATIENT' && consultation.patientId !== user.id) {
      throw new ForbiddenError('You are not authorized to cancel this consultation');
    }

    if (user.role === 'DOCTOR' && (!user.doctor || consultation.doctorId !== user.doctor.id)) {
      throw new ForbiddenError('You are not authorized to cancel this consultation');
    }

    if (consultation.status !== 'BOOKED') {
      throw new ConflictError(
        `Cannot cancel a consultation with status '${consultation.status}'. Only 'BOOKED' consultations may be cancelled.`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Re-release slot to AVAILABLE
      await tx.availabilitySlot.update({
        where: { id: consultation.slotId },
        data: { status: 'AVAILABLE' }
      });

      const updatedConsultation = await tx.consultation.update({
        where: { id: consultationId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason
        },
        include: { slot: true }
      });

      // Update payment to REFUNDED if was PAID
      const payment = await tx.payment.findUnique({
        where: { consultationId }
      });
      if (payment && payment.status === 'PAID') {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED' }
        });
      }

      await AuditService.log({
        userId: user.id,
        action: 'CONSULTATION_CANCELLED',
        entityType: 'Consultation',
        entityId: consultationId,
        details: { cancellationReason },
        tx
      });

      return updatedConsultation;
    });

    return updated;
  }
}
