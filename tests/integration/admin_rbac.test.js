import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import {
  app,
  clearDatabase,
  testPrisma,
  createTestDoctor,
  createTestUser
} from '../helpers/testUtils.js';

describe('Admin Analytics & RBAC Security Tests', () => {
  let adminData;
  let patientData;

  beforeEach(async () => {
    await clearDatabase();
    adminData = await createTestUser({ email: 'admin.test@amrutam.co.in', role: 'ADMIN' });
    patientData = await createTestUser({ email: 'patient.test@example.com', role: 'PATIENT' });
    await createTestDoctor({ email: 'dr.adminview@example.com' });
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('should reject non-admin users attempting to access admin analytics (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/overview')
      .set('Authorization', `Bearer ${patientData.token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should allow admin to retrieve database-aggregated analytics overview', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/overview')
      .set('Authorization', `Bearer ${adminData.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.consultations).toBeDefined();
    expect(res.body.data.payments).toBeDefined();
    expect(res.body.data.users).toBeDefined();
    expect(res.body.data.users.ADMIN).toBeGreaterThanOrEqual(1);
  });

  it('should allow admin to retrieve doctor utilization metrics', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics/doctor-utilization')
      .set('Authorization', `Bearer ${adminData.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].utilizationRatePercent).toBeDefined();
  });

  it('should allow admin to query audit logs with filters and pagination', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs?page=1&limit=10')
      .set('Authorization', `Bearer ${adminData.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });
});
