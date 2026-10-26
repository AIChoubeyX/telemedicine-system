import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';

// Dedicated Prisma client connected to the test database
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: env.TEST_DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/amrutam_telemedicine_test?schema=public'
    }
  }
});

export const app = createApp();

export async function clearDatabase() {
  // Clear in correct foreign key order
  await testPrisma.idempotencyKey.deleteMany();
  await testPrisma.prescription.deleteMany();
  await testPrisma.payment.deleteMany();
  await testPrisma.consultation.deleteMany();
  await testPrisma.availabilitySlot.deleteMany();
  await testPrisma.auditLog.deleteMany();
  await testPrisma.doctor.deleteMany();
  await testPrisma.profile.deleteMany();
  await testPrisma.user.deleteMany();
}

export async function createTestUser({
  email,
  password = 'Password123',
  role = 'PATIENT',
  firstName = 'Test',
  lastName = 'User'
}) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await testPrisma.user.create({
    data: {
      email,
      passwordHash,
      role,
      isActive: true,
      profile: {
        create: {
          firstName,
          lastName,
          phone: '+919000000000'
        }
      }
    },
    include: {
      profile: true,
      doctor: true
    }
  });

  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  return { user, token };
}

export async function createTestDoctor({
  email,
  password = 'Password123',
  specialization = 'Ayurvedic Consultant',
  consultationFee = 500.0
}) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await testPrisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'DOCTOR',
      isActive: true,
      profile: {
        create: {
          firstName: 'Dr. Test',
          lastName: 'Physician',
          phone: '+919111111111'
        }
      },
      doctor: {
        create: {
          specialization,
          qualifications: 'BAMS',
          experienceYears: 5,
          consultationFee,
          isVerified: true
        }
      }
    },
    include: {
      profile: true,
      doctor: true
    }
  });

  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  return { user, doctor: user.doctor, token };
}

export async function createTestSlot(doctorId, startTimeOffsetHours = 2) {
  const startTime = new Date(Date.now() + startTimeOffsetHours * 3600 * 1000);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes slot

  return await testPrisma.availabilitySlot.create({
    data: {
      doctorId,
      startTime,
      endTime,
      status: 'AVAILABLE'
    }
  });
}
