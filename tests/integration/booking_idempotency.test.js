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

describe('Booking & Database-backed Idempotency Tests', () => {
  let doctor;
  let patientToken;

  beforeEach(async () => {
    await clearDatabase();
    const docData = await createTestDoctor({ email: 'doc.booking@example.com' });
    doctor = docData.doctor;

    const patientData = await createTestUser({ email: 'pat.booking@example.com' });
    patientToken = patientData.token;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('should successfully book an available slot with Idempotency-Key', async () => {
    const slot = await createTestSlot(doctor.id, 5);
    const idempotencyKey = uuidv4();

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        slotId: slot.id,
        reason: 'General wellness checkup'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.consultation.status).toBe('BOOKED');
    expect(res.body.data.payment.status).toBe('PENDING');

    // Verify slot updated in database
    const dbSlot = await testPrisma.availabilitySlot.findUnique({
      where: { id: slot.id }
    });
    expect(dbSlot.status).toBe('BOOKED');
  });

  it('should require Idempotency-Key header for booking (400 Bad Request)', async () => {
    const slot = await createTestSlot(doctor.id, 6);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        slotId: slot.id,
        reason: 'No key check'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('should reject booking an already booked slot (409 Conflict)', async () => {
    const slot = await createTestSlot(doctor.id, 7);

    // First booking
    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({ slotId: slot.id })
      .expect(201);

    // Another patient tries to book the same slot
    const { token: otherPatientToken } = await createTestUser({
      email: 'other.patient@example.com'
    });

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${otherPatientToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({ slotId: slot.id });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('should return identical response when repeating request with the same Idempotency-Key (Replay)', async () => {
    const slot = await createTestSlot(doctor.id, 8);
    const idempotencyKey = uuidv4();
    const payload = { slotId: slot.id, reason: 'Follow-up consultation' };

    // Initial request
    const firstRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(firstRes.status).toBe(201);
    const firstConsultationId = firstRes.body.data.consultation.id;

    // Repeated request with identical key and identical payload
    const secondRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(secondRes.status).toBe(201);
    expect(secondRes.headers['x-idempotent-replay']).toBe('true');
    expect(secondRes.body.data.consultation.id).toBe(firstConsultationId);

    // Ensure database contains only 1 consultation
    const totalConsultations = await testPrisma.consultation.count({
      where: { slotId: slot.id }
    });
    expect(totalConsultations).toBe(1);
  });

  it('should reject idempotency key reuse with different payload (422 Unprocessable Entity)', async () => {
    const slot1 = await createTestSlot(doctor.id, 9);
    const slot2 = await createTestSlot(doctor.id, 10);
    const idempotencyKey = uuidv4();

    // First request with slot1
    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ slotId: slot1.id, reason: 'Initial reason' })
      .expect(201);

    // Reusing same idempotencyKey with different payload (slot2)
    const mismatchRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ slotId: slot2.id, reason: 'Different payload reason' });

    expect(mismatchRes.status).toBe(422);
    expect(mismatchRes.body.success).toBe(false);
    expect(mismatchRes.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  it('should cancel booking and re-release availability slot to AVAILABLE', async () => {
    const slot = await createTestSlot(doctor.id, 11);

    const bookRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({ slotId: slot.id })
      .expect(201);

    const consultationId = bookRes.body.data.consultation.id;

    // Cancel booking
    const cancelRes = await request(app)
      .post(`/api/v1/bookings/${consultationId}/cancel`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        cancellationReason: 'Emergency conflict arisen'
      });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);
    expect(cancelRes.body.data.status).toBe('CANCELLED');

    // Verify slot is returned to AVAILABLE
    const dbSlot = await testPrisma.availabilitySlot.findUnique({
      where: { id: slot.id }
    });
    expect(dbSlot.status).toBe('AVAILABLE');
  });
});
