import { AuthService } from './auth.service.js';

export class AuthController {
  static async register(req, res, next) {
    try {
      const result = await AuthService.registerPatient(req.body, {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(201).json({
        success: true,
        message: 'Patient registration successful',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  static async login(req, res, next) {
    try {
      const result = await AuthService.login(req.body, {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  static async refreshToken(req, res, next) {
    try {
      const result = await AuthService.refreshToken(req.body.refreshToken);

      return res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMe(req, res, next) {
    try {
      const user = await AuthService.getMe(req.user.id);

      return res.status(200).json({
        success: true,
        data: user
      });
    } catch (err) {
      next(err);
    }
  }

  static async logout(req, res) {
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  }
}
