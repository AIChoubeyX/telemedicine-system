import { PaymentsService } from './payments.service.js';

export class PaymentsController {
  static async processPayment(req, res, next) {
    try {
      const payment = await PaymentsService.processPayment(
        req.params.id,
        req.body,
        req.user
      );

      return res.status(200).json({
        success: true,
        message: 'Payment processed successfully',
        data: payment
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPaymentById(req, res, next) {
    try {
      const payment = await PaymentsService.getPaymentById(req.params.id, req.user);
      return res.status(200).json({
        success: true,
        data: payment
      });
    } catch (err) {
      next(err);
    }
  }

  static async listPayments(req, res, next) {
    try {
      const result = await PaymentsService.listPayments(req.user, req.query);
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
