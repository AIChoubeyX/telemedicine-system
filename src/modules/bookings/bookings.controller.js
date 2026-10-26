import { BookingsService } from './bookings.service.js';
import { BadRequestError } from '../../lib/errors.js';

export class BookingsController {
  static async bookSlot(req, res, next) {
    try {
      const idempotencyKey = req.headers['idempotency-key'];
      if (!idempotencyKey) {
        throw new BadRequestError('Idempotency-Key header is required for booking creation');
      }

      const result = await BookingsService.bookSlot({
        patientId: req.user.id,
        slotId: req.body.slotId,
        reason: req.body.reason,
        idempotencyKey,
        reqPath: req.originalUrl,
        reqMethod: req.method,
        rawPayload: req.body
      });

      if (result.isReplay) {
        res.setHeader('X-Idempotent-Replay', 'true');
      }

      return res.status(result.statusCode).json(result.body);
    } catch (err) {
      next(err);
    }
  }

  static async listBookings(req, res, next) {
    try {
      const result = await BookingsService.listBookings(req.user, req.query);
      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }

  static async getBookingById(req, res, next) {
    try {
      const booking = await BookingsService.getBookingById(req.params.id, req.user);
      return res.status(200).json({
        success: true,
        data: booking
      });
    } catch (err) {
      next(err);
    }
  }

  static async cancelBooking(req, res, next) {
    try {
      const booking = await BookingsService.cancelBooking(
        req.params.id,
        req.body.cancellationReason,
        req.user
      );
      return res.status(200).json({
        success: true,
        message: 'Booking cancelled successfully',
        data: booking
      });
    } catch (err) {
      next(err);
    }
  }
}
