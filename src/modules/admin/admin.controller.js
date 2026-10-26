import { AdminService } from './admin.service.js';
import { AuditService } from '../audit/audit.service.js';

export class AdminController {
  static async getOverviewAnalytics(req, res, next) {
    try {
      const analytics = await AdminService.getOverviewAnalytics(req.query);
      return res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (err) {
      next(err);
    }
  }

  static async getDoctorUtilization(req, res, next) {
    try {
      const utilization = await AdminService.getDoctorUtilization();
      return res.status(200).json({
        success: true,
        data: utilization
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAuditLogs(req, res, next) {
    try {
      const result = await AuditService.queryLogs(req.query);
      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }

  static async listUsers(req, res, next) {
    try {
      const result = await AdminService.listUsers(req.query);
      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateUserStatus(req, res, next) {
    try {
      const updated = await AdminService.updateUserStatus(
        req.params.id,
        req.body.isActive,
        req.user.id
      );

      return res.status(200).json({
        success: true,
        message: `User status updated to ${req.body.isActive ? 'ACTIVE' : 'INACTIVE'}`,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }
}
