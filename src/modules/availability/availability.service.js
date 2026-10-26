import { prisma } from '../../lib/prisma.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ForbiddenError
} from '../../lib/errors.js';
import { AuditService } from '../audit/audit.service.js';

export class AvailabilityService {
  /**
   * Create an availability slot for a doctor
   */
  static async createSlot({ doctorId, startTime, endTime }, user) {
    // 1. Determine effective doctorId
    let targetDoctorId = doctorId;
    if (user.role === 'DOCTOR') {
      if (!user.doctor) {
        throw new ForbiddenError('Authenticated user does not have an active doctor profile');
      }
      if (doctorId && doctorId !== user.doctor.id) {
        throw new ForbiddenError('Doctors can only create availability slots for themselves');
      }
      targetDoctorId = user.doctor.id;
    } else if (user.role === 'ADMIN') {
      if (!targetDoctorId) {
        throw new BadRequestError('Admin must specify doctorId');
      }
    } else {
      throw new ForbiddenError('Only doctors and admins may create availability slots');
    }

    // 2. Verify doctor exists and is verified
    const doctor = await prisma.doctor.findUnique({
      where: { id: targetDoctorId }
    });
    if (!doctor) {
      throw new NotFoundError('Doctor not found');
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      throw new BadRequestError('Start time must be before end time');
    }

    // 3. Overlap check for the same doctor
    const overlapping = await prisma.availabilitySlot.findFirst({
      where: {
        doctorId: targetDoctorId,
        status: { in: ['AVAILABLE', 'BOOKED'] },
        AND: [
          { startTime: { lt: end } },
          { endTime: { gt: start } }
        ]
      }
    });

    if (overlapping) {
      throw new ConflictError(
        'Doctor already has an active or booked availability slot overlapping with this time window'
      );
    }

    // 4. Create slot
    const slot = await prisma.availabilitySlot.create({
      data: {
        doctorId: targetDoctorId,
        startTime: start,
        endTime: end,
        status: 'AVAILABLE'
      }
    });

    await AuditService.log({
      userId: user.id,
      action: 'SLOT_CREATED',
      entityType: 'AvailabilitySlot',
      entityId: slot.id,
      details: { doctorId: targetDoctorId, startTime: start, endTime: end }
    });

    return slot;
  }

  /**
   * List available slots for a doctor on a specific date (or upcoming)
   */
  static async getAvailableSlots({ doctorId, date }) {
    const where = {
      doctorId,
      status: 'AVAILABLE'
    };

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      where.startTime = {
        gte: startOfDay,
        lte: endOfDay
      };
    } else {
      where.startTime = {
        gte: new Date()
      };
    }

    const slots = await prisma.availabilitySlot.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        doctor: {
          select: {
            id: true,
            specialization: true,
            consultationFee: true,
            user: {
              select: {
                profile: true
              }
            }
          }
        }
      }
    });

    return slots;
  }
}
