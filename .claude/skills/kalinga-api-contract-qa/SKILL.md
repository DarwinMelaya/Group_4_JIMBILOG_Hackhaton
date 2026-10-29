---
name: kalinga-api-contract-qa
description: Validate KALINGA REST contracts, database migrations, Row Level Security, status transitions and end-to-end type compatibility.
---

Inspect existing API and DB. Compare implemented endpoint methods/paths with OpenAPI 3.1 (if present), shared TypeScript types and input/output validators. Check:

- `/api/v1/public/config`, public articles and clinics, `clinic-matches`, clinic booking requirements, POST appointment request and POST reference+secret lookup.
- Server-side rate limiting, strict Zod/equivalent validation, safe errors, pagination bounds, consent/booking policy version checks and `Asia/Manila` time semantics.
- Clinic management, provider status updates with expected version/atomic audit, list/public publication filters, status transition matrix, authorized staff scope and IDOR rejection.
- Schema unique/index/foreign key constraints, production-demo segregation, RLS and service credentials never exposed to browser. No diagnosis/results tables.
- Stateless matching only verified facts; `unknown` and stale flags correctly preserved.
- Local repeatability: migrations and seed scripts should run consistently; tests are isolated from production.

Execute working API and DB test commands, report failures and paths; don't modify global dependencies/ORM architecture unless needed and justified.
