import { PrescriptionsService } from './prescriptions.service.js';

export class PrescriptionsController {
  static async createPrescription(req, res, next) {
    try {
      const prescription = await PrescriptionsService.createPrescription(req.body, req.user);
      return res.status(201).json({
        success: true,
        message: 'Prescription created successfully',
        data: prescription
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPrescriptionById(req, res, next) {
    try {
      const prescription = await PrescriptionsService.getPrescriptionById(req.params.id, req.user);
      return res.status(200).json({
        success: true,
        data: prescription
      });
    } catch (err) {
      next(err);
    }
  }

  static async listPrescriptions(req, res, next) {
    try {
      const result = await PrescriptionsService.listPrescriptions(req.user, req.query);
      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }
}
