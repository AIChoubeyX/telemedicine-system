import { AvailabilityService } from './availability.service.js';

export class AvailabilityController {
  static async createSlot(req, res, next) {
    try {
      const slot = await AvailabilityService.createSlot(req.body, req.user);
      return res.status(201).json({
        success: true,
        message: 'Availability slot created successfully',
        data: slot
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAvailableSlots(req, res, next) {
    try {
      const slots = await AvailabilityService.getAvailableSlots(req.query);
      return res.status(200).json({
        success: true,
        data: slots
      });
    } catch (err) {
      next(err);
    }
  }
}
