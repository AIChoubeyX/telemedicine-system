import { Router } from 'express';
import { ConsultationsController } from './consultations.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { updateStatusSchema } from './consultations.schema.js';

const router = Router();

router.use(authenticate);

// Transition consultation status (Start, Complete, No-Show, Cancel)
router.patch(
  '/:id/status',
  validate({ body: updateStatusSchema }),
  ConsultationsController.updateStatus
);

export default router;
