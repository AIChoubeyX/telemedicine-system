import { ConsultationsService } from './consultations.service.js';

export class ConsultationsController {
  static async updateStatus(req, res, next) {
    try {
      const updated = await ConsultationsService.updateStatus(
        req.params.id,
        req.body,
        req.user
      );

      return res.status(200).json({
        success: true,
        message: `Consultation status transitioned to ${req.body.status}`,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }
}
