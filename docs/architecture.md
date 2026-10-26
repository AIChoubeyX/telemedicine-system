# Amrutam Telemedicine Backend — Architecture & System Design Document

## 1. Executive Summary & Core Design Philosophy

The Amrutam Telemedicine Backend is architected as a high-integrity, secure-by-default modular monolith designed for clinical consultations, doctor scheduling, electronic prescriptions, payment workflows, and administrative intelligence.

The architecture prioritizes:
- **Data Integrity Over Optimistic Assumptions**: Concurrency conflicts in doctor scheduling and double bookings are mathematically eliminated at the database level rather than deferred to application memory.
- **Fail-Safe Idempotency**: Network retries, timeout reconnections, and double-clicks never produce duplicate bookings or double charges.
- **Strict Clinical Confidentiality**: Zero cross-patient access to medical prescriptions, automated PII/PHI redaction in system logs, and parameterized database queries via Prisma ORM.
- **Resilient Infrastructure**: Redis caching is treated as an optional accelerator; the application transparently degrades to in-memory fallback if Redis is unavailable.

---

## 2. System Architecture & Component Hierarchy

The system follows a strict layered architecture with loose coupling between modules:

```
[ HTTP Clients (Mobile App / Web SPA / Admin Dashboard) ]
                         │
                         ▼
             [ Reverse Proxy / Ingress ]
                         │
                         ▼
        ┌────────────────────────────────────────────────────────┐
        │ Express Application Pipeline                           │
        │ - Helmet (Security Headers)                            │
        │ - CORS Configuration                                   │
        │ - Correlation ID Generator (X-Request-ID)              │
        │ - Metrics Middleware (Latency, Requests, Error Counts) │
        │ - Pino HTTP Logger (Redaction of Sensitive PII/PHI)    │
        │ - Rate Limiting (IP & Endpoint Sensitive Windows)      │
        │ - Swagger UI (/docs, /api/docs)                        │
        └────────────────────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────────────────────┐
        │ Routing & Validation Layer (/api/v1)                  │
        │ - Zod Request Body, Query, and Param Schemas           │
        │ - Authentication (JWT Bearer Token Extraction)         │
        │ - Role-Based Access Control (PATIENT, DOCTOR, ADMIN)   │
        └────────────────────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────────────────────┐
        │ Domain Modules                                         │
        │ ├── auth/          (Registration, Login, JWT tokens)   │
        │ ├── doctors/       (Directory, Search, Profiles)       │
        │ ├── availability/  (Slot allocation, Overlap guards)   │
        │ ├── bookings/      (Atomic reservation & idempotency)  │
        │ ├── consultations/ (Lifecycle finite-state machine)    │
        │ ├── prescriptions/ (Clinical records & RX generation)  │
        │ ├── payments/      (Mock gateway adapter & status)     │
        │ ├── admin/         (Aggregated analytics & audit logs) │
        │ └── audit/         (Immutable state mutation audit)    │
        └────────────────────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────────────────────┐
        │ Data & Persistence Layer                               │
        │ - Prisma ORM Client Singleton                          │
        │ - PostgreSQL 16+ Database                              │
        │   ├── Row-Level Locks (SELECT ... FOR UPDATE)          │
        │   ├── Strict Table Constraints & Unique Composite Keys │
        │   └── Database-level Transactions ($transaction)       │
        │ - Redis / Fallback In-Memory Cache Store               │
        └────────────────────────────────────────────────────────┘
```

---

## 3. High-Concurrency Booking & Double-Booking Prevention

### The Problem
In high-demand medical consultation platforms, multiple patients frequently attempt to reserve the exact same availability slot at the same millisecond. Relying on application-level memory locks or in-memory caches is fundamentally flawed in distributed environments.

### The Two-Tier Database Solution
Our booking engine enforces concurrency safety across two coordinated layers:

1. **Row-Level Pessimistic Locking (`SELECT ... FOR UPDATE`)**:
   Inside an atomic PostgreSQL transaction, the booking engine executes:
   ```sql
   SELECT id, "doctorId", "startTime", "endTime", status
   FROM availability_slots
   WHERE id = $slotId
   FOR UPDATE;
   ```
   - When Patient A and Patient B execute simultaneous requests for Slot X, PostgreSQL grants the row lock to Patient A and pauses Patient B's transaction.
   - Patient A verifies `status == 'AVAILABLE'`, updates the slot to `BOOKED`, creates the consultation record, and commits.
   - When Patient B's transaction resumes, it immediately sees `status == 'BOOKED'`, aborts the transaction, and returns an HTTP 409 `SLOT_UNAVAILABLE` error.

2. **Schema-Level Uniqueness Invariant**:
   The `consultations` table defines `slotId` as `@unique`. Even if an unexpected code path attempted an unauthorized write, PostgreSQL's uniqueness engine rejects duplicate slot assignments with an invariant `P2002` constraint failure.

---

## 4. Database-Backed Idempotency Architecture

To prevent duplicate reservations from network retries, the booking endpoint mandates an `Idempotency-Key` header:

```
Patient Request ──> Hash Payload (SHA-256) ──> Check idempotency_keys (userId, key)
                                                       │
         ┌─────────────────────────────────────────────┴─────────────────────────┐
         ▼                                             ▼                         ▼
 [ Status: COMPLETED ]                       [ Status: IN_PROGRESS ]     [ Key Not Found ]
         │                                             │                         │
 Compare Payload Hash                          Return 409 Conflict        Insert IN_PROGRESS
 ├── Match: Return Cached 201 Response body                                      │
 └── Mismatch: Reject with 422 Unprocessable                              Execute Booking Tx
                                                                                 │
                                                                         Update COMPLETED
```

### Key Retention Policy
- Idempotency records are persisted in PostgreSQL with an explicit `expiresAt` timestamp set to **24 hours** from creation.
- Keys older than 24 hours are automatically pruned upon re-use.
- If a booking transaction fails or encounters a transient error, the in-progress idempotency key is released immediately to allow subsequent valid retries.

---

## 5. Consultation Lifecycle Finite State Machine (FSM)

Consultation states represent clinical workflows and follow a strict unidirectional transition graph:

```
              ┌───────────────┐
              │    BOOKED     │
              └───────┬───────┘
          ┌───────────┼───────────┐
          │           │           │
          ▼           ▼           ▼
   ┌─────────────┐ ┌─────────┐ ┌─────────┐
   │ IN_PROGRESS │ │NO_SHOW  │ │CANCELLED│
   └──────┬──────┘ └─────────┘ └─────────┘
          │
          ▼
   ┌─────────────┐
   │  COMPLETED  │
   └─────────────┘
```

### Transition Validation Rules:
- **`BOOKED` → `IN_PROGRESS`**: Only the assigned doctor or an admin can start the consultation.
- **`BOOKED` → `CANCELLED`**: Allowed by the patient, doctor, or admin. Re-releases the availability slot back to `AVAILABLE` and marks pending payments as `REFUNDED`.
- **`BOOKED` → `NO_SHOW`**: Triggered by doctor or admin if the patient fails to attend.
- **`IN_PROGRESS` → `COMPLETED`**: Concluded by the attending doctor upon completion of clinical assessment.
- **Terminal States**: `COMPLETED`, `CANCELLED`, and `NO_SHOW` cannot transition to any other state. Any backward or invalid transition is rejected with HTTP 409 Conflict.

---

## 6. Security & Data Protection Controls

| Control | Implementation |
|---|---|
| **Authentication** | Stateless JWT access tokens (1-day expiry) + refresh tokens (7-day expiry) |
| **Password Security** | Bcrypt with 12 salt rounds; minimum 8 characters with letter & number requirements |
| **RBAC** | Strict role assertions (`PATIENT`, `DOCTOR`, `ADMIN`) on all sensitive routes |
| **Cross-Patient Isolation** | Prescriptions and consultations enforce ownership checks (`patientId === req.user.id`) |
| **PII / PHI Redaction** | Structured Pino logger automatically redacts passwords, tokens, medications, and diagnoses |
| **Injection Defense** | Prisma ORM parameterizes all SQL statements; Zod validates incoming payloads |
| **DoS Defense** | Rate limiting configured per route type (Auth: 20 req/15min, Sensitive: 30 req/min, Global: 500 req/min) |

---

## 7. Observability & Operational Readiness

- **`/health`**: Liveness probe returning current status and timestamp.
- **`/ready`**: Readiness probe executing a live PostgreSQL query and checking cache status; returns HTTP 503 if the database is unreachable.
- **`/metrics`**: Real-time HTTP metrics tracking total requests, error rates (4xx, 5xx), average latency, active requests, and heap memory usage.
- **Audit Trails**: Every administrative and clinical mutation is captured in `audit_logs` with actor ID, IP address, user-agent, and serialized audit context.
