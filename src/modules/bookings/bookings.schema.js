import { z } from 'zod';

export const createBookingSchema = z.object({
  slotId: z.string().uuid('slotId must be a valid UUID'),
  reason: z.string().max(500, 'Reason cannot exceed 500 characters').optional()
});

export const cancelBookingSchema = z.object({
  cancellationReason: z.string().min(3, 'Cancellation reason must be at least 3 characters').max(500)
});

export const bookingQuerySchema = z.object({
  status: z.enum(['BOOKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  page: z.string().transform(Number).optional().default('1'),
  limit: z.string().transform(Number).optional().default('20')
});
