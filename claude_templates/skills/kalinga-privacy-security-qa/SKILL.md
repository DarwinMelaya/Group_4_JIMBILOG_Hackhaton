---
name: kalinga-privacy-security-qa
description: Privacy and security release-gate review for KALINGA clinic discovery, anonymous booking, staff roles, minors and notifications.
---

Trace the actual data flow and attempt negative tests; do not accept frontend-only assertions as security.

- Public education, optional pathway and clinics are account-free; never save health preferences, suspected exposure, history or location in analytics or durable user profile.
- Anonymous appointment statuses require **reference + independent high-entropy secret**; cryptographic verifier, constant-time compare, uniform failures, throttling, no secret in URLs/logs/localStorage/cache/referrers; private responses `no-store`.
- User data collected is provider-approved minimum and disclosed *before* submit. “Requested/pending” is never “confirmed” until scoped staff action. Concurrency and idempotency must be tested.
- Staff auth, per-clinic RBAC and PostgreSQL RLS, IDOR cross-clinic attack tests, no technical-admin patient-data superpower by default, audit metadata redacted.
- Age 15–17: look for **actual approved SOP artifact/version and clinic mapping**. If absent, real minor submissions must fail closed. Demo fixtures can exercise an explicit mock policy only in isolated development. Never invent Philippine consent law.
- Provider directory facts need source/verification date; unverified/confidentiality unknown is never “fully anonymous”. No diagnosis, test results or sexual history stored in MVP.
- Mock notifications only in local dev; deterministic neutral content, opt-in and no outbound sends. PWA must not cache private API responses or reveal STI context in lock-screen content.
- Demo flags cannot activate production partner claims; release checklist must remain red until qualified human medical/legal/partner/security reviews occur.

Return a severity-ranked finding list with exact tests/paths and blockers; distinguish passed checks from tests not run.
