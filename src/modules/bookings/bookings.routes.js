import { Router } from 'express';
import { BookingsController } from './bookings.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { sensitiveOpRateLimiter } from '../../middleware/rateLimiter.js';
import {
  createBookingSchema,
  cancelBookingSchema,
  bookingQuerySchema
} from './bookings.schema.js';

const router = Router();

router.use(authenticate);

// Book an available slot (Patients only)
router.post(
  '/',
  requireRole('PATIENT'),
  sensitiveOpRateLimiter,
  validate({ body: createBookingSchema }),
  BookingsController.bookSlot
);

// List consultations (Patient, Doctor, or Admin)
router.get(
  '/',
  validate({ query: bookingQuerySchema }),
  BookingsController.listBookings
);

// Get consultation details
router.get('/:id', BookingsController.getBookingById);

// Cancel booking
router.post(
  '/:id/cancel',
  validate({ body: cancelBookingSchema }),
  BookingsController.cancelBooking
);

export default router;
