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

describe('PostgreSQL Concurrency & Double-Booking Safety', () => {
  let doctor;

  beforeEach(async () => {
    await clearDatabase();
    const docData = await createTestDoctor({ email: 'dr.concurrency@example.com' });
    doctor = docData.doctor;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('proves PostgreSQL row-locking prevents simultaneous double-booking of the same slot', async () => {
    const slot = await createTestSlot(doctor.id, 12);

    // Create two distinct patients
    const patient1 = await createTestUser({ email: 'concurrency.p1@example.com' });
    const patient2 = await createTestUser({ email: 'concurrency.p2@example.com' });

    // Fire simultaneous requests to book the exact same slot
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patient1.token}`)
        .set('Idempotency-Key', uuidv4())
        .send({ slotId: slot.id, reason: 'Patient 1 concurrent request' }),
      request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patient2.token}`)
        .set('Idempotency-Key', uuidv4())
        .send({ slotId: slot.id, reason: 'Patient 2 concurrent request' })
    ]);

    const statuses = [res1.status, res2.status].sort();

    // Exactly one must succeed (201) and the other must be rejected (409)
    expect(statuses).toEqual([201, 409]);

    const successfulRes = res1.status === 201 ? res1 : res2;
    const rejectedRes = res1.status === 409 ? res1 : res2;

    expect(successfulRes.body.success).toBe(true);
    expect(successfulRes.body.data.consultation.slot.id).toBe(slot.id);

    expect(rejectedRes.body.success).toBe(false);
    expect(rejectedRes.body.error.code).toBe('SLOT_UNAVAILABLE');

    // Verify final database state: exactly 1 consultation exists for this slot
    const consultationsInDb = await testPrisma.consultation.findMany({
      where: { slotId: slot.id }
    });
    expect(consultationsInDb.length).toBe(1);

    // Verify slot status in database is strictly BOOKED
    const slotInDb = await testPrisma.availabilitySlot.findUnique({
      where: { id: slot.id }
    });
    expect(slotInDb.status).toBe('BOOKED');
  });
});
