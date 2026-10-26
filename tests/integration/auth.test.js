import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, clearDatabase, testPrisma } from '../helpers/testUtils.js';

describe('Authentication & RBAC Integration Tests', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('should successfully register a new patient', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'newpatient@example.com',
        password: 'Password123',
        firstName: 'Amit',
        lastName: 'Kumar',
        phone: '+919876543210'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('newpatient@example.com');
    expect(res.body.data.user.role).toBe('PATIENT');
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('should reject registration when email already exists (409 Conflict)', async () => {
    // First registration
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'duplicate@example.com',
        password: 'Password123',
        firstName: 'Amit',
        lastName: 'Kumar'
      });

    // Duplicate attempt
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'duplicate@example.com',
        password: 'Password123',
        firstName: 'Amit',
        lastName: 'Kumar'
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('should reject registration with weak password (400 Validation Error)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'weakpass@example.com',
        password: 'weak',
        firstName: 'Amit',
        lastName: 'Kumar'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should successfully log in with valid credentials', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'loginuser@example.com',
        password: 'Password123',
        firstName: 'Priya',
        lastName: 'Sharma'
      });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'loginuser@example.com',
        password: 'Password123'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe('loginuser@example.com');
  });

  it('should reject login with invalid password (401 Unauthorized)', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'wrongpass@example.com',
        password: 'Password123',
        firstName: 'Priya',
        lastName: 'Sharma'
      });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'wrongpass@example.com',
        password: 'IncorrectPassword999'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should reject protected endpoints without token (401)', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should reject protected endpoints with malformed token (401)', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token-string');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should retrieve profile with valid access token', async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'profile@example.com',
        password: 'Password123',
        firstName: 'Rohan',
        lastName: 'Mehta'
      });

    const token = regRes.body.data.accessToken;

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('profile@example.com');
    expect(res.body.data.profile.firstName).toBe('Rohan');
  });
});
