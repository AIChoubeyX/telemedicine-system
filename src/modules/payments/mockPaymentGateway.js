import { v4 as uuidv4 } from 'uuid';

export class MockPaymentGateway {
  /**
   * Mock payment processing adapter
   * Explicitly avoids storing or processing real card details.
   */
  static async processPayment({ _paymentId, amount, currency = 'INR', paymentMethod = 'UPI' }) {
    // Simulate gateway roundtrip
    const gatewayRef = `GW-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;

    // Mock successful settlement
    return {
      success: true,
      gatewayReference: gatewayRef,
      status: 'PAID',
      processedAt: new Date().toISOString(),
      amount,
      currency,
      paymentMethod,
      provider: 'MOCK_PAYMENT_GATEWAY'
    };
  }
}
