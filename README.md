# Amrutam Telemedicine Platform — Backend Core

Production-grade, secure-by-default REST API backend built for the Amrutam Telemedicine assignment. Engineered with Node.js, Express (ES Modules), PostgreSQL, Prisma ORM, and Zod.

---

## 🚀 Key Features Implemented

- **Authentication & RBAC**:
  - Secure patient registration with password hashing via bcrypt (12 salt rounds).
  - Role-Based Access Control (`PATIENT`, `DOCTOR`, `ADMIN`). Public registration strictly enforces `PATIENT` role.
  - JWT access tokens (1 day) and refresh tokens (7 days).
- **Doctor Directory & Scheduling**:
  - Doctor search and filtering by specialization and experience.
  - Granular availability slot creation with strict start/end time validation.
  - Database-level overlapping slot prevention for the same doctor.
- **Atomic Booking Engine (Highest Priority)**:
  - **Pessimistic Row Locking**: Enforces `SELECT ... FOR UPDATE` inside an atomic PostgreSQL transaction.
  - **Zero Double-Booking Guarantee**: Proven under real concurrency tests with simultaneous HTTP requests.
  - Unique database constraints on `slotId` physically prevent duplicate reservations.
- **Database-Backed Idempotency**:
  - Mandatory `Idempotency-Key` header on booking endpoints.
  - SHA-256 payload hashing: Identical payloads return cached 201 responses (`X-Idempotent-Replay: true`), while mismatched payloads are rejected with 422 Unprocessable Entity.
  - 24-hour key retention policy.
- **Consultation State Machine**:
  - Strict lifecycle transitions: `BOOKED` → `IN_PROGRESS` → `COMPLETED` (or `CANCELLED` / `NO_SHOW`).
  - Terminal states protect against invalid regressions.
- **Clinical Records & Prescriptions**:
  - Issued only for eligible consultations (`IN_PROGRESS` or `COMPLETED`) by the assigned doctor.
  - Strict cross-patient data access protection (403 Forbidden).
  - Diagnostic and medication details are automatically redacted from server logs.
- **Payment Processing**:
  - Isolated mock payment gateway adapter avoiding PAN/CVV handling.
  - State tracking (`PENDING`, `PAID`, `FAILED`, `REFUNDED`) and duplicate payment prevention.
- **Admin & Analytics Intelligence**:
  - Aggregated consultation and payment summaries computed directly within PostgreSQL.
  - Doctor utilization rates and queryable audit log streams.
- **Observability & Probes**:
  - Structured JSON logging via Pino with sensitive data redaction.
  - `/health` liveness probe, `/ready` database readiness probe, and `/metrics` latency/error tracker.
  - OpenAPI 3.1 specification interactive Swagger UI.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js (v22 LTS, ES Modules) |
| **Framework** | Express.js 4.x |
| **Database** | PostgreSQL 16+ |
| **ORM** | Prisma 6.x with declarative migrations |
| **Validation** | Zod 3.x |
| **Security** | Helmet, CORS, Express-Rate-Limit, Bcrypt.js, JsonWebToken |
| **Cache** | Redis abstraction with safe in-memory fallback |
| **Logging** | Pino & Pino-HTTP |
| **API Docs** | OpenAPI 3.1 with Swagger UI |
| **Testing** | Vitest 3.x & Supertest |
| **Containerization**| Docker & Docker Compose |
| **CI** | GitHub Actions |

---

## 📋 Prerequisites

- **Node.js**: `v20.x` or `v22.x` (LTS)
- **npm**: `v10.x` or later
- **PostgreSQL**: `v15+` (or Docker for containerized setup)

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | API server listen port | `4000` |
| `NODE_ENV` | Environment mode | `development` / `test` / `production` |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://postgres:postgres@localhost:5432/amrutam_telemedicine?schema=public` |
| `TEST_DATABASE_URL` | Dedicated test database URL | `postgresql://postgres:postgres@localhost:5432/amrutam_telemedicine_test?schema=public` |
| `JWT_SECRET` | Secret key for JWT access tokens (min 32 chars) | `amrutam-telemed-jwt-secret-key-32chars-min` |
| `REFRESH_TOKEN_SECRET` | Secret key for refresh tokens (min 32 chars) | `amrutam-telemed-refresh-secret-32chars` |
| `CORS_ORIGIN` | Allowed CORS origins | `*` |
| `RATE_LIMIT_MAX` | Global rate limit ceiling per window | `500` |
| `REDIS_URL` | Optional Redis URL (leave empty for memory fallback)| `redis://localhost:6379` |

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Migrations & Seeding
Ensure PostgreSQL is running, then run:

```bash
# Apply migrations to database
npx prisma migrate dev --name init

# Populate seed data (Default Admin, Doctors, Patient, and Slots)
npm run prisma:seed
```

### 3. Start Local Development Server
```bash
npm run dev
# Or for normal start:
npm start
```
The server will start at `http://localhost:4000`.

### 4. Interactive API Documentation (Swagger UI)
Visit the interactive Swagger UI in your browser:
- **`http://localhost:4000/docs`**
- **`http://localhost:4000/api/docs`**

---

## 🐳 Docker Deployment

To spin up the entire application along with isolated PostgreSQL and Redis containers:

```bash
# Build and run containers in background
docker compose up -d --build

# Run migrations inside container
docker compose exec api npx prisma migrate deploy

# Seed database
docker compose exec api npm run prisma:seed
```

Check container status:
```bash
docker compose ps
```

---

## 🧪 Testing

Run the automated test suite powered by Vitest and Supertest:

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run linter
npm run lint
```

### Test Coverage Highlights:
- **`tests/integration/auth.test.js`**: Patient registration, role restriction, invalid credentials, token verification, and refresh flows.
- **`tests/integration/doctor_availability.test.js`**: Doctor search, slot scheduling, validation, and overlapping availability rejection.
- **`tests/integration/booking_idempotency.test.js`**: Slot booking, 400 on missing key, 409 on booked slot, 422 on payload mismatch, and idempotency replay.
- **`tests/concurrency/double_booking.test.js`**: Real PostgreSQL row locking proving two simultaneous booking requests result in exactly one 201 Created and one 409 Slot Unavailable.
- **`tests/integration/consultations_prescriptions_payments.test.js`**: Full lifecycle state machine, cross-patient prescription isolation, and mock payment gateway.
- **`tests/integration/admin_rbac.test.js`**: RBAC boundaries, database aggregation metrics, and audit log queries.

---

## 📂 Project Directory Structure

```
├── .github/workflows/ci.yml       # GitHub Actions CI workflow
├── compose.yaml                   # Docker Compose definition
├── Dockerfile                     # Multi-stage production container image
├── docs/
│   ├── architecture.md            # In-depth architectural design
│   ├── booking-sequence.mmd       # Mermaid sequence diagram for bookings
│   ├── er-diagram.mmd             # Mermaid ER diagram
│   ├── threat-model.md            # STRIDE threat model & mitigations
│   └── disaster-recovery.md       # Backup, RPO/RTO & DR strategy
├── openapi.yaml                   # OpenAPI 3.1 specification
├── prisma/
│   ├── schema.prisma              # Database models, constraints, and enums
│   ├── migrations/                # Versioned SQL migrations
│   └── seed.js                    # Database seed script
├── src/
│   ├── app.js                     # Express app configuration & middlewares
│   ├── server.js                  # Server lifecycle & graceful shutdown
│   ├── config/env.js              # Zod-validated environment config
│   ├── lib/                       # Prisma, Logger, Redis cache, Idempotency, Errors
│   ├── middleware/                # Auth, RBAC, Validation, Error handling, Rate limiter
│   ├── modules/                   # Auth, Doctors, Availability, Bookings, Consultations,
│   │                              # Prescriptions, Payments, Admin, Audit
│   └── observability/             # /health, /ready, /metrics, request tracking
└── tests/
    ├── concurrency/               # High-concurrency double booking test
    ├── helpers/                   # Test fixtures and database reset utilities
    └── integration/               # Integration tests across all modules
```

---

## 🩺 Seed Credentials

| Role | Email | Password | Details |
|---|---|---|---|
| **Admin** | `admin@amrutam.co.in` | `Password123` | System Administrator |
| **Doctor 1** | `dr.sharma@amrutam.co.in` | `Password123` | Ayurvedic Physician & Panchakarma |
| **Doctor 2** | `dr.patel@amrutam.co.in` | `Password123` | Dermatology & Ayurvedic Skincare |
| **Patient** | `patient.rahul@example.com`| `Password123` | Registered Patient |

---

## 🔍 Health & Observability Endpoints

- **`GET /health`**: Liveness probe returning `{ status: "UP", timestamp: "..." }`.
- **`GET /ready`**: Readiness probe verifying PostgreSQL connection and cache state.
- **`GET /metrics`**: Real-time request counts, 4xx/5xx error rates, average latency, and memory consumption.
