# Security Threat Model & Risk Analysis — Amrutam Telemedicine Platform

## 1. Scope & Objective

This threat model outlines the security architecture, asset classifications, identified threat actors, STRIDE vulnerability assessments, implemented mitigations, and planned production controls for the Amrutam Telemedicine backend.

---

## 2. Asset Classification & Sensitivity Matrix

| Asset | Sensitivity Level | Description | Storage Location |
|---|---|---|---|
| **User Credentials** | Tier 1 (Critical) | User email addresses and hashed passwords | `users` table |
| **Authentication Secrets** | Tier 1 (Critical) | JWT secret keys, refresh token secrets | Environment variables |
| **Medical Records (PHI)** | Tier 1 (Critical) | Diagnoses, prescription medications, doctor notes | `prescriptions`, `consultations` |
| **Financial / Payment Data**| Tier 2 (High) | Transaction references, payment status, fees | `payments` table |
| **Availability & Bookings** | Tier 3 (Moderate) | Doctor schedule slots and patient appointments | `availability_slots`, `consultations` |
| **Audit Logs** | Tier 2 (High) | Historical record of security & clinical actions | `audit_logs` table |

*Note: In accordance with PCI-DSS guidelines, the application never collects, processes, or stores primary account numbers (PAN), CVVs, or cardholder credentials. Payment execution is delegated to an isolated gateway adapter.*

---

## 3. STRIDE Threat Assessment & Mitigations

### 3.1. Spoofing Identity
- **Threat**: An attacker impersonates a doctor to issue prescriptions or access patient medical records.
- **Implemented Mitigation**:
  - Cryptographically signed JWT tokens with expiration timestamps.
  - Role-Based Access Control (`requireRole('DOCTOR', 'ADMIN')`).
  - Strict ownership checks (`consultation.doctorId === user.doctor.id`).
- **Planned Production Improvement**: Mutual TLS (mTLS) for internal microservices; WebAuthn / FIDO2 hardware tokens for clinical staff.

### 3.2. Tampering with Data
- **Threat**: Malicious client modifies consultation fees or alters availability slot status directly.
- **Implemented Mitigation**:
  - Centralized Zod input validation strips unexpected fields.
  - Fees are looked up authoritatively from the verified doctor profile in the database, never trusted from client payloads.
  - Parameterized database operations through Prisma eliminate SQL injection.
- **Planned Production Improvement**: Cryptographic signatures on digital prescriptions (PKI / X.509).

### 3.3. Repudiation
- **Threat**: A patient denies booking an appointment or a doctor denies issuing a prescription.
- **Implemented Mitigation**:
  - Database-backed `audit_logs` record every critical state transition with actor ID, IP address, user-agent, and timestamp.
  - Idempotency records tie unique client requests to exact timestamps and payload hashes.
- **Planned Production Improvement**: Append-only log forwarding to an immutable write-once-read-many (WORM) storage bucket (e.g., AWS S3 Object Lock).

### 3.4. Information Disclosure
- **Threat**: Patient A views prescriptions or clinical notes belonging to Patient B (Cross-Patient Access).
- **Implemented Mitigation**:
  - Hardened authorization filters: `prescription.patientId === req.user.id`.
  - Structured Pino logging engine redacts `password`, `token`, `medications`, `diagnosis`, and `Authorization` headers.
  - Express error handler suppresses database internals, query details, and stack traces from API responses.
- **Planned Production Improvement**: Field-level encryption (FLE) for clinical diagnostic text using envelope encryption.

### 3.5. Denial of Service (DoS)
- **Threat**: High-frequency automated scripts exhaust database connections or spam the booking endpoint.
- **Implemented Mitigation**:
  - Tiered rate limiting (Auth: 20 req/15min, Sensitive: 30 req/min, Global: 500 req/min).
  - PostgreSQL connection pool limits and timeouts.
  - Body size parsing cap limited to 1MB.
- **Planned Production Improvement**: Cloudflare DDoS shield and Web Application Firewall (WAF) layer.

### 3.6. Elevation of Privilege
- **Threat**: A registered patient submits `role: "ADMIN"` or `role: "DOCTOR"` during public registration.
- **Implemented Mitigation**:
  - The public registration handler hardcodes `role: 'PATIENT'`. Any incoming `role` field in the request body is stripped and ignored.
  - Doctor creation is exclusively restricted to verified administrators via `POST /api/v1/doctors`.
- **Planned Production Improvement**: Multi-factor approval (Four-Eyes Principle) for admin privilege escalations.

---

## 4. Cryptographic Key Management & Rotation Policy

1. **JWT & Refresh Token Secrets**:
   - Environment-variable provisioned; minimum 32 characters high-entropy strings.
   - Rotated every 90 days in production.
   - Graceful rotation strategy: The verification layer accepts both current and previous generation keys for a 24-hour overlapping window.
2. **Password Hashing**:
   - Bcrypt with 12 salt rounds (adaptive cost parameter).
   - Automatically recalibrated as computational resources advance.
3. **Transport Layer**:
   - TLS 1.3 mandated for all public ingress connections.
   - HSTS headers enforced via Helmet with `max-age: 31536000` (1 year).
