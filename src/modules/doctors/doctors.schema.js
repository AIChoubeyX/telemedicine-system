import { z } from 'zod';

export const createDoctorSchema = z.object({
  email: z.string().email('Valid email is required').toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').trim(),
  lastName: z.string().min(1, 'Last name is required').trim(),
  phone: z.string().optional(),
  specialization: z.string().min(1, 'Specialization is required').trim(),
  qualifications: z.string().optional(),
  experienceYears: z.number().int().min(0, 'Experience must be 0 or more').default(0),
  consultationFee: z.number().positive('Consultation fee must be positive'),
  bio: z.string().optional()
});

export const updateDoctorSchema = z.object({
  specialization: z.string().min(1).optional(),
  qualifications: z.string().optional(),
  experienceYears: z.number().int().min(0).optional(),
  consultationFee: z.number().positive().optional(),
  bio: z.string().optional(),
  isVerified: z.boolean().optional()
});

export const doctorQuerySchema = z.object({
  specialization: z.string().optional(),
  search: z.string().optional(),
  page: z.string().transform(Number).optional().default('1'),
  limit: z.string().transform(Number).optional().default('20')
});
