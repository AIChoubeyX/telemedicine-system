import { Router } from 'express';
import { PaymentsController } from './payments.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { sensitiveOpRateLimiter } from '../../middleware/rateLimiter.js';
import {
  processPaymentSchema,
  paymentQuerySchema
} from './payments.schema.js';

const router = Router();

router.use(authenticate);

// Process payment (Patients only)
router.post(
  '/:id/process',
  requireRole('PATIENT'),
  sensitiveOpRateLimiter,
  validate({ body: processPaymentSchema }),
  PaymentsController.processPayment
);

// Get single payment
router.get('/:id', PaymentsController.getPaymentById);

// List payments
router.get(
  '/',
  validate({ query: paymentQuerySchema }),
  PaymentsController.listPayments
);

export default router;
