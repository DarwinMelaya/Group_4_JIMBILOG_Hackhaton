---
name: kalinga-i18n-clinical-qa
description: Check English and Filipino language parity and enforce separate medical review gates for all sensitive KALINGA health and booking content.
---

Confirm `en` and `fil` are selectable from desktop and mobile Menu; accessible `lang` metadata and language change announcements are correct. Compare navigation, CTAs, forms, error texts, request statuses, consent disclosures, FAQs, neutral reminders, help, urgent path and admin screens where relevant. Test placeholder parity, escaped interpolation, responsive longer Filipino copy, numeric date/time/currency formatting in Asia/Manila and missing-translation key handling.

**Clinical copy must not be machine-certified.** Article content and urgent PEP language must have review status **per locale and version**, named authorized qualified medical reviewer and dated source where actually supplied. Demo drafts remain clearly marked `DEMO / NOT CLINICALLY REVIEWED` and appropriate Filipino equivalent; never publish them in real rollout. No invented medical guidance or age-specific legal rules. If translated clinic consent requirements lack approval, block real submission in that language or transparently route to reviewed provider requirements.

Report translation completeness, review gate failures, actual test evidence and unresolved human reviews.
