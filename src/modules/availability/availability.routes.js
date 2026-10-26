import { Router } from 'express';
import { AvailabilityController } from './availability.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  createSlotSchema,
  availabilityQuerySchema
} from './availability.schema.js';

const router = Router();

router.get(
  '/',
  validate({ query: availabilityQuerySchema }),
  AvailabilityController.getAvailableSlots
);

router.post(
  '/',
  authenticate,
  requireRole('DOCTOR', 'ADMIN'),
  validate({ body: createSlotSchema }),
  AvailabilityController.createSlot
);

export default router;
