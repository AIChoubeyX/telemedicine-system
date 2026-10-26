import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import {
  app,
  clearDatabase,
  testPrisma,
  createTestDoctor,
  createTestUser,
  createTestSlot
} from '../helpers/testUtils.js';

describe('Consultation Lifecycle, Prescriptions, and Payments', () => {
  let doctorData;
  let patientData;
  let consultationId;
  let paymentId;

  beforeEach(async () => {
    await clearDatabase();
    doctorData = await createTestDoctor({ email: 'dr.lifecycle@example.com' });
    patientData = await createTestUser({ email: 'patient.lifecycle@example.com' });

    const slot = await createTestSlot(doctorData.doctor.id, 14);

    // Book consultation
    const bookRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientData.token}`)
      .set('Idempotency-Key', uuidv4())
      .send({ slotId: slot.id, reason: 'Health assessment' })
      .expect(201);

    consultationId = bookRes.body.data.consultation.id;
    paymentId = bookRes.body.data.payment.id;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('should enforce proper consultation lifecycle transitions', async () => {
    // 1. Doctor transitions BOOKED -> IN_PROGRESS
    const startRes = await request(app)
      .patch(`/api/v1/consultations/${consultationId}/status`)
      .set('Authorization', `Bearer ${doctorData.token}`)
      .send({ status: 'IN_PROGRESS', notes: 'Consultation commenced via video call' });

    expect(startRes.status).toBe(200);
    expect(startRes.body.data.status).toBe('IN_PROGRESS');

    // 2. Doctor transitions IN_PROGRESS -> COMPLETED
    const completeRes = await request(app)
      .patch(`/api/v1/consultations/${consultationId}/status`)
      .set('Authorization', `Bearer ${doctorData.token}`)
      .send({ status: 'COMPLETED', notes: 'Consultation concluded successfully' });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe('COMPLETED');

    // 3. Invalid transition: COMPLETED -> IN_PROGRESS (Must be rejected with 409 Conflict)
    const invalidRes = await request(app)
      .patch(`/api/v1/consultations/${consultationId}/status`)
      .set('Authorization', `Bearer ${doctorData.token}`)
      .send({ status: 'IN_PROGRESS' });

    expect(invalidRes.status).toBe(409);
    expect(invalidRes.body.success).toBe(false);
    expect(invalidRes.body.error.code).toBe('CONFLICT');
  });

  it('should allow assigned doctor to create prescription and prevent cross-patient access', async () => {
    // Start consultation first so it is eligible for prescription
    await request(app)
      .patch(`/api/v1/consultations/${consultationId}/status`)
      .set('Authorization', `Bearer ${doctorData.token}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    // Doctor creates prescription
    const presRes = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorData.token}`)
      .send({
        consultationId,
        diagnosis: 'Seasonal allergic rhinitis and vata imbalance',
        medications: [
          {
            name: 'Sitopaladi Churna',
            dosage: '3g',
            frequency: 'Twice daily with honey',
            duration: '7 days',
            instructions: 'Take after meals'
          }
        ],
        instructions: 'Avoid cold beverages and dairy products for 1 week.'
      });

    expect(presRes.status).toBe(201);
    expect(presRes.body.success).toBe(true);
    const prescriptionId = presRes.body.data.id;

    // Authorized patient retrieves prescription
    const patientGetRes = await request(app)
      .get(`/api/v1/prescriptions/${prescriptionId}`)
      .set('Authorization', `Bearer ${patientData.token}`);

    expect(patientGetRes.status).toBe(200);
    expect(patientGetRes.body.data.diagnosis).toBe('Seasonal allergic rhinitis and vata imbalance');

    // Unrelated patient attempts to access (Cross-patient data access)
    const unrelatedPatient = await createTestUser({ email: 'intruder@example.com' });
    const crossAccessRes = await request(app)
      .get(`/api/v1/prescriptions/${prescriptionId}`)
      .set('Authorization', `Bearer ${unrelatedPatient.token}`);

    expect(crossAccessRes.status).toBe(403);
    expect(crossAccessRes.body.success).toBe(false);
    expect(crossAccessRes.body.error.code).toBe('FORBIDDEN');
  });

  it('should process payment via mock gateway and reject duplicate payment attempts', async () => {
    // Process payment
    const payRes = await request(app)
      .post(`/api/v1/payments/${paymentId}/process`)
      .set('Authorization', `Bearer ${patientData.token}`)
      .send({ paymentMethod: 'UPI' });

    expect(payRes.status).toBe(200);
    expect(payRes.body.success).toBe(true);
    expect(payRes.body.data.status).toBe('PAID');

    // Attempting to process already PAID payment must fail with 409 Conflict
    const duplicatePayRes = await request(app)
      .post(`/api/v1/payments/${paymentId}/process`)
      .set('Authorization', `Bearer ${patientData.token}`)
      .send({ paymentMethod: 'UPI' });

    expect(duplicatePayRes.status).toBe(409);
    expect(duplicatePayRes.body.success).toBe(false);
    expect(duplicatePayRes.body.error.code).toBe('CONFLICT');
  });
});
