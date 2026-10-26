import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import {
  NotFoundError,
  ConflictError
} from '../../lib/errors.js';
import { AuditService } from '../audit/audit.service.js';

export class DoctorsService {
  /**
   * List doctors with filtering, search, and pagination
   */
  static async listDoctors({ specialization, search, page = 1, limit = 20 }) {
    const where = {
      isVerified: true,
      user: {
        isActive: true
      }
    };

    if (specialization) {
      where.specialization = {
        contains: specialization,
        mode: 'insensitive'
      };
    }

    if (search) {
      where.OR = [
        { specialization: { contains: search, mode: 'insensitive' } },
        { bio: { contains: search, mode: 'insensitive' } },
        {
          user: {
            profile: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } }
              ]
            }
          }
        }
      ];
    }

    const skip = (page - 1) * limit;

    const [total, doctors] = await Promise.all([
      prisma.doctor.count({ where }),
      prisma.doctor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { experienceYears: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: true
            }
          }
        }
      })
    ]);

    return {
      data: doctors,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get doctor by ID
   */
  static async getDoctorById(id) {
    const doctor = await prisma.doctor.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: true
          }
        }
      }
    });

    if (!doctor) {
      throw new NotFoundError('Doctor not found');
    }

    return doctor;
  }

  /**
   * Admin-only: Create doctor profile
   */
  static async createDoctor(data, adminUserId) {
    const {
      email,
      password,
      firstName,
      lastName,
      phone,
      specialization,
      qualifications,
      experienceYears,
      consultationFee,
      bio
    } = data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const doctor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'DOCTOR',
          isActive: true,
          profile: {
            create: {
              firstName,
              lastName,
              phone: phone || null
            }
          },
          doctor: {
            create: {
              specialization,
              qualifications: qualifications || null,
              experienceYears: experienceYears || 0,
              consultationFee,
              bio: bio || null,
              isVerified: true
            }
          }
        },
        include: {
          profile: true,
          doctor: true
        }
      });

      await AuditService.log({
        userId: adminUserId,
        action: 'DOCTOR_CREATED',
        entityType: 'Doctor',
        entityId: user.doctor.id,
        details: { email, specialization },
        tx
      });

      return user.doctor;
    });

    return doctor;
  }
}
