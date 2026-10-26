import { Router } from 'express';
import { DoctorsController } from './doctors.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import {
  createDoctorSchema,
  doctorQuerySchema
} from './doctors.schema.js';

const router = Router();

router.get('/', validate({ query: doctorQuerySchema }), DoctorsController.listDoctors);
router.get('/:id', DoctorsController.getDoctorById);

// Admin-only doctor creation
router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  validate({ body: createDoctorSchema }),
  DoctorsController.createDoctor
);

export default router;
