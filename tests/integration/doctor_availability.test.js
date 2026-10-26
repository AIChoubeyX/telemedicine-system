import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, clearDatabase, testPrisma, createTestDoctor, createTestUser } from '../helpers/testUtils.js';

describe('Doctor Management & Availability Tests', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('should list and search verified doctors by specialization', async () => {
    await createTestDoctor({
      email: 'ayur.doc@example.com',
      specialization: 'Ayurveda Specialist'
    });
    await createTestDoctor({
      email: 'skin.doc@example.com',
      specialization: 'Dermatologist'
    });

    const res = await request(app)
      .get('/api/v1/doctors?specialization=Ayurveda')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].specialization).toContain('Ayurveda');
  });

  it('should allow a doctor to create an availability slot', async () => {
    const { doctor, token } = await createTestDoctor({
      email: 'slot.doc@example.com'
    });

    const startTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const endTime = new Date(Date.now() + 24.5 * 3600 * 1000).toISOString();

    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({
        startTime,
        endTime
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.doctorId).toBe(doctor.id);
    expect(res.body.data.status).toBe('AVAILABLE');
  });

  it('should reject availability slot when startTime is after endTime', async () => {
    const { token } = await createTestDoctor({
      email: 'invalid.slot@example.com'
    });

    const startTime = new Date(Date.now() + 25 * 3600 * 1000).toISOString();
    const endTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({
        startTime,
        endTime
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject overlapping availability slots for the same doctor (409 Conflict)', async () => {
    const { token } = await createTestDoctor({
      email: 'overlap.doc@example.com'
    });

    const baseTime = Date.now() + 48 * 3600 * 1000;
    const slot1Start = new Date(baseTime).toISOString();
    const slot1End = new Date(baseTime + 3600 * 1000).toISOString(); // 1 hr slot

    // Create first slot
    await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({
        startTime: slot1Start,
        endTime: slot1End
      })
      .expect(201);

    // Attempt overlapping slot (starts 30 min into the first slot)
    const slot2Start = new Date(baseTime + 1800 * 1000).toISOString();
    const slot2End = new Date(baseTime + 5400 * 1000).toISOString();

    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({
        startTime: slot2Start,
        endTime: slot2End
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('should reject patient attempting to create availability slots (403 Forbidden)', async () => {
    const { token } = await createTestUser({
      email: 'patient.forbidden@example.com',
      role: 'PATIENT'
    });

    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({
        startTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        endTime: new Date(Date.now() + 25 * 3600 * 1000).toISOString()
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
