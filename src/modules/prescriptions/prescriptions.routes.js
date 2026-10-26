import { Router } from 'express';
import { PrescriptionsController } from './prescriptions.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  createPrescriptionSchema,
  prescriptionQuerySchema
} from './prescriptions.schema.js';

const router = Router();

router.use(authenticate);

// Create prescription (Doctor or Admin only)
router.post(
  '/',
  requireRole('DOCTOR', 'ADMIN'),
  validate({ body: createPrescriptionSchema }),
  PrescriptionsController.createPrescription
);

// List prescriptions
router.get(
  '/',
  validate({ query: prescriptionQuerySchema }),
  PrescriptionsController.listPrescriptions
);

// Get prescription by ID
router.get('/:id', PrescriptionsController.getPrescriptionById);

export default router;
