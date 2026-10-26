import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash('Password123', 12);

  // 1. Seed Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@amrutam.co.in' },
    update: {},
    create: {
      email: 'admin@amrutam.co.in',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      profile: {
        create: {
          firstName: 'System',
          lastName: 'Administrator',
          phone: '+919876543210'
        }
      }
    }
  });
  console.log('✅ Admin seeded:', admin.email);

  // 2. Seed Doctor 1 (Ayurveda)
  const doctor1User = await prisma.user.upsert({
    where: { email: 'dr.sharma@amrutam.co.in' },
    update: {},
    create: {
      email: 'dr.sharma@amrutam.co.in',
      passwordHash,
      role: 'DOCTOR',
      isActive: true,
      profile: {
        create: {
          firstName: 'Dr. Rajesh',
          lastName: 'Sharma',
          phone: '+919876543211',
          gender: 'MALE'
        }
      },
      doctor: {
        create: {
          specialization: 'Ayurvedic Medicine & Panchakarma',
          qualifications: 'BAMS, MD (Ayurveda) - BHU',
          experienceYears: 12,
          consultationFee: 750.0,
          bio: 'Expert in chronic lifestyle disorder management, gut health, and authentic Ayurvedic therapies.',
          isVerified: true
        }
      }
    },
    include: { doctor: true }
  });
  console.log('✅ Doctor 1 seeded:', doctor1User.email);

  // 3. Seed Doctor 2 (Holistic Medicine)
  const doctor2User = await prisma.user.upsert({
    where: { email: 'dr.patel@amrutam.co.in' },
    update: {},
    create: {
      email: 'dr.patel@amrutam.co.in',
      passwordHash,
      role: 'DOCTOR',
      isActive: true,
      profile: {
        create: {
          firstName: 'Dr. Ananya',
          lastName: 'Patel',
          phone: '+919876543212',
          gender: 'FEMALE'
        }
      },
      doctor: {
        create: {
          specialization: 'Dermatology & Ayurvedic Skincare',
          qualifications: 'BAMS, Fellowship in Aesthetic Medicine',
          experienceYears: 8,
          consultationFee: 600.0,
          bio: 'Specialist in herbal skincare, psoriasis, and natural wellness protocols.',
          isVerified: true
        }
      }
    },
    include: { doctor: true }
  });
  console.log('✅ Doctor 2 seeded:', doctor2User.email);

  // 4. Seed Patient
  const patient = await prisma.user.upsert({
    where: { email: 'patient.rahul@example.com' },
    update: {},
    create: {
      email: 'patient.rahul@example.com',
      passwordHash,
      role: 'PATIENT',
      isActive: true,
      profile: {
        create: {
          firstName: 'Rahul',
          lastName: 'Verma',
          phone: '+919876543213',
          gender: 'MALE'
        }
      }
    }
  });
  console.log('✅ Patient seeded:', patient.email);

  // 5. Seed upcoming availability slots for Doctor 1
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const slot1Start = new Date(tomorrow);
  slot1Start.setHours(10, 0, 0, 0);
  const slot1End = new Date(tomorrow);
  slot1End.setHours(10, 30, 0, 0);

  const slot2Start = new Date(tomorrow);
  slot2Start.setHours(11, 0, 0, 0);
  const slot2End = new Date(tomorrow);
  slot2End.setHours(11, 30, 0, 0);

  await prisma.availabilitySlot.upsert({
    where: {
      doctorId_startTime_endTime: {
        doctorId: doctor1User.doctor.id,
        startTime: slot1Start,
        endTime: slot1End
      }
    },
    update: {},
    create: {
      doctorId: doctor1User.doctor.id,
      startTime: slot1Start,
      endTime: slot1End,
      status: 'AVAILABLE'
    }
  });

  await prisma.availabilitySlot.upsert({
    where: {
      doctorId_startTime_endTime: {
        doctorId: doctor1User.doctor.id,
        startTime: slot2Start,
        endTime: slot2End
      }
    },
    update: {},
    create: {
      doctorId: doctor1User.doctor.id,
      startTime: slot2Start,
      endTime: slot2End,
      status: 'AVAILABLE'
    }
  });

  console.log('✅ Availability slots seeded for Doctor 1');
  console.log('🌱 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
