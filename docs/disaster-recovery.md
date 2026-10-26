# Backup and Disaster Recovery (BCDR) Policy — Amrutam Telemedicine

## 1. Objectives & Service Level Indicators (SLIs)

This document establishes the Business Continuity and Disaster Recovery (BCDR) strategy for the Amrutam Telemedicine platform, designed to safeguard patient records, doctor schedules, and audit histories.

### Target Recovery Objectives:
- **Recovery Point Objective (RPO)**: **< 15 minutes** (Maximum allowable data loss in the event of catastrophic primary region failure).
- **Recovery Time Objective (RTO)**: **< 60 minutes** (Maximum allowable time to restore full clinical operations).

---

## 2. Backup Strategy & Cadence

| Backup Type | Frequency | Retention Schedule | Storage Target |
|---|---|---|---|
| **Continuous WAL Archiving** | Real-time (streamed every 60s) | 7 days | Encrypted Multi-Region Object Storage (S3 / GCS) |
| **Automated Full Snapshots** | Daily at 02:00 UTC | 30 days daily, 12 months monthly | Geographically isolated storage vault |
| **Logical Schema Backups** | Prior to any migration deployment | 90 days | Version-controlled migration artifact repository |

### Encryption of Backups:
- All database dumps and snapshot volumes are encrypted at rest using AES-256.
- Access to backup keys is governed by dedicated KMS policies restricted to automated recovery agents.

---

## 3. Disaster Recovery Scenarios & Procedures

### Scenario A: Accidental Data Corruption or Malicious Mutation
1. Identify the timestamp of the corruption event using `audit_logs`.
2. Provision a standby PostgreSQL instance from the latest clean daily snapshot.
3. Apply Write-Ahead Logs (WAL) up to the exact point in time immediately prior to the incident (Point-in-Time Recovery - PITR).
4. Validate schema integrity and reconnect API pods by updating the `DATABASE_URL` secret.

### Scenario B: Primary Cloud Region Outage
1. Declare regional disaster protocol.
2. Direct DNS traffic to the secondary standby region via Cloudflare / Route53 health checks.
3. Promote the cross-region PostgreSQL read replica to primary read/write status.
4. Scale up the containerized application pods using Docker Compose / Kubernetes manifests.
5. Verify application health via `/ready` endpoint.

---

## 4. Restoration Testing Cadence

- **Automated Synthetic Restore (Weekly)**: An automated CI/CD job restores the most recent snapshot into an isolated sandbox environment, applies pending Prisma migrations, and executes the automated test suite to verify integrity.
- **Tabletop DR Exercise (Quarterly)**: Engineering team executes a simulated catastrophic failure drill to test failover procedures, communication channels, and RTO benchmarks.

---

## 5. Distinction Between Implemented & Production Controls

| Feature / Control | Current Local/Staging Status | Production Target |
|---|---|---|
| **Prisma Migrations & Seeds** | Fully Implemented & Automated | Automated in CI/CD pipeline |
| **Health & Readiness Probes** | Fully Implemented (`/health`, `/ready`) | Integrated with Kubernetes / Docker health monitors |
| **Database Transactions & Rollback** | Fully Implemented with ACID isolation | Distributed cross-replica consistency |
| **Automated WAL Shipping** | Documented Standard Operating Procedure | Managed Cloud RDS Multi-AZ Replication |
| **Geographic Read Replica** | Documented Standard Operating Procedure | Active-Passive cross-region automated failover |
