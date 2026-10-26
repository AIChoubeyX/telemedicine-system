import { z } from 'zod';

const medicationItemSchema = z.object({
  name: z.string().min(1, 'Medication name is required'),
  dosage: z.string().min(1, 'Dosage is required (e.g., 500mg)'),
  frequency: z.string().min(1, 'Frequency is required (e.g., Twice daily after meals)'),
  duration: z.string().min(1, 'Duration is required (e.g., 5 days)'),
  instructions: z.string().optional()
});

export const createPrescriptionSchema = z.object({
  consultationId: z.string().uuid('consultationId must be a valid UUID'),
  diagnosis: z.string().min(3, 'Diagnosis must be at least 3 characters').max(500),
  medications: z.array(medicationItemSchema).min(1, 'At least one medication is required'),
  instructions: z.string().max(1000).optional(),
  followUpDate: z.string().datetime().optional()
});

export const prescriptionQuerySchema = z.object({
  page: z.string().transform(Number).optional().default('1'),
  limit: z.string().transform(Number).optional().default('20')
});
