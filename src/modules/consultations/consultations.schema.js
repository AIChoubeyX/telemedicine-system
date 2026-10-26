import { z } from 'zod';

export const updateStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED']),
  notes: z.string().max(1000).optional(),
  cancellationReason: z.string().max(500).optional()
});
