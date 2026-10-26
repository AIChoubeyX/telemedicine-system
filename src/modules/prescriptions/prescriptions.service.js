import { prisma } from '../../lib/prisma.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError
} from '../../lib/errors.js';
import { AuditService } from '../audit/audit.service.js';

export class PrescriptionsService {
  /**
   * Create prescription for an eligible consultation
   */
  static async createPrescription(data, user) {
    const { consultationId, diagnosis, medications, instructions, followUpDate } = data;

    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { prescription: true }
    });

    if (!consultation) {
      throw new NotFoundError('Consultation not found');
    }

    // Role check: Only assigned doctor or ADMIN
    if (user.role === 'DOCTOR') {
      if (!user.doctor || consultation.doctorId !== user.doctor.id) {
        throw new ForbiddenError('You can only issue prescriptions for your own assigned consultations');
      }
    } else if (user.role !== 'ADMIN') {
      throw new ForbiddenError('Only doctors and administrators may issue prescriptions');
    }

    // Eligibility check: Consultation must be in progress or completed
    if (!['IN_PROGRESS', 'COMPLETED'].includes(consultation.status)) {
      throw new ConflictError(
        `Prescriptions can only be issued for consultations that are 'IN_PROGRESS' or 'COMPLETED'. Current status: '${consultation.status}'`
      );
    }

    if (consultation.prescription) {
      throw new ConflictError('A prescription has already been created for this consultation');
    }

    const prescription = await prisma.prescription.create({
      data: {
        consultationId,
        doctorId: consultation.doctorId,
        patientId: consultation.patientId,
        diagnosis,
        medications,
        instructions: instructions || null,
        followUpDate: followUpDate ? new Date(followUpDate) : null
      },
      include: {
        doctor: {
          include: {
            user: { select: { email: true, profile: true } }
          }
        },
        patient: {
          select: { id: true, email: true, profile: true }
        }
      }
    });

    await AuditService.log({
      userId: user.id,
      action: 'PRESCRIPTION_CREATED',
      entityType: 'Prescription',
      entityId: prescription.id,
      details: { consultationId, patientId: consultation.patientId }
    });

    return prescription;
  }

  /**
   * Get single prescription with strict ownership check
   */
  static async getPrescriptionById(prescriptionId, user) {
    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        doctor: {
          include: {
            user: { select: { email: true, profile: true } }
          }
        },
        patient: {
          select: { id: true, email: true, profile: true }
        },
        consultation: {
          select: { id: true, consultationNumber: true, status: true }
        }
      }
    });

    if (!prescription) {
      throw new NotFoundError('Prescription not found');
    }

    // Cross-patient protection & ownership check
    if (user.role === 'PATIENT' && prescription.patientId !== user.id) {
      throw new ForbiddenError('Access denied: You cannot view another patient\'s prescription');
    }

    if (user.role === 'DOCTOR' && (!user.doctor || prescription.doctorId !== user.doctor.id)) {
      throw new ForbiddenError('Access denied: You cannot view prescriptions you did not issue');
    }

    return prescription;
  }

  /**
   * List prescriptions for current user
   */
  static async listPrescriptions(user, { page = 1, limit = 20 }) {
    const where = {};
    if (user.role === 'PATIENT') {
      where.patientId = user.id;
    } else if (user.role === 'DOCTOR') {
      if (!user.doctor) {
        throw new ForbiddenError('Doctor profile missing');
      }
      where.doctorId = user.doctor.id;
    }

    const skip = (page - 1) * limit;

    const [total, prescriptions] = await Promise.all([
      prisma.prescription.count({ where }),
      prisma.prescription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issuedAt: 'desc' },
        include: {
          doctor: {
            include: {
              user: { select: { profile: true } }
            }
          },
          consultation: {
            select: { id: true, consultationNumber: true }
          }
        }
      })
    ]);

    return {
      data: prescriptions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
