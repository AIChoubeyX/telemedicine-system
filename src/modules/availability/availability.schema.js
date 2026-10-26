import { z } from 'zod';

export const createSlotSchema = z.object({
  doctorId: z.string().uuid().optional(),
  startTime: z.string().datetime({ message: 'startTime must be a valid ISO-8601 datetime' }),
  endTime: z.string().datetime({ message: 'endTime must be a valid ISO-8601 datetime' })
}).refine((data) => new Date(data.startTime) < new Date(data.endTime), {
  message: 'startTime must be strictly before endTime',
  path: ['endTime']
});

export const availabilityQuerySchema = z.object({
  doctorId: z.string().uuid('doctorId must be a valid UUID'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format').optional()
});
