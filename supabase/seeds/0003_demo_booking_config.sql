-- DEMO seed (dev/test ONLY, loaded by apps/api/src/db/seed.ts). Booking REQUEST configuration for the FICTITIOUS demo
-- clinics. All wording is placeholder DEMO text: not a real clinic's disclosure, not reviewed, no real procedures.
-- Varied on purpose: A/B/E/F enabled with different optional fields, C present but disabled, D has no config at all.
-- Idempotent (on conflict do nothing).
insert into clinic_booking_config (
  clinic_id, enabled, service_mode, contact_preference_mode, notes_mode, notes_max_length, low_disclosure_supported,
  disclosure_purpose, disclosure_recipient, disclosure_cancellation, min_advance_days, max_advance_days, retention_days
)
select c.id, v.enabled, v.service_mode, v.contact_mode, v.notes_mode, v.notes_max, v.low_disclosure,
       'DEMO text: the clinic asks for an age group, a preferred date and time window, and optionally the service you are interested in, only so that it can propose a time. Nothing about health, symptoms or results is requested.',
       'DEMO text: only the staff of this fictitious clinic would receive this request. No real clinic exists in this DEMO, so nobody receives it.',
       'DEMO text: to withdraw a request, a real clinic would give instructions here. In this DEMO there is nothing to cancel.',
       1, v.max_days, 30
from clinics c
join (values
  ('demo-clinic-a', true,  'optional', 'optional', 'optional', 200, true,  30),
  ('demo-clinic-b', true,  'required', 'hidden',   'hidden',   200, false, 21),
  ('demo-clinic-c', false, 'optional', 'hidden',   'optional', 200, false, 30),
  ('demo-clinic-e', true,  'optional', 'required', 'optional', 120, true,  30),
  ('demo-clinic-f', true,  'hidden',   'optional', 'optional', 200, false, 14)
) as v(slug, enabled, service_mode, contact_mode, notes_mode, notes_max, low_disclosure, max_days) on v.slug = c.slug
on conflict (clinic_id) do nothing;
