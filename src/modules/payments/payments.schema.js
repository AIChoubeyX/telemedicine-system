import { z } from 'zod';

export const processPaymentSchema = z.object({
  paymentMethod: z.enum(['UPI', 'NET_BANKING', 'WALLET', 'CARD_MOCK']).default('UPI')
});

export const paymentQuerySchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
  page: z.string().transform(Number).optional().default('1'),
  limit: z.string().transform(Number).optional().default('20')
});
