import { DoctorsService } from './doctors.service.js';

export class DoctorsController {
  static async listDoctors(req, res, next) {
    try {
      const result = await DoctorsService.listDoctors(req.query);
      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }

  static async getDoctorById(req, res, next) {
    try {
      const doctor = await DoctorsService.getDoctorById(req.params.id);
      return res.status(200).json({
        success: true,
        data: doctor
      });
    } catch (err) {
      next(err);
    }
  }

  static async createDoctor(req, res, next) {
    try {
      const doctor = await DoctorsService.createDoctor(req.body, req.user.id);
      return res.status(201).json({
        success: true,
        message: 'Doctor created successfully',
        data: doctor
      });
    } catch (err) {
      next(err);
    }
  }
}
