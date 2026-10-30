-- DEMO seed (dev/test ONLY, loaded by apps/api/src/db/seed.ts; refused in staging/production).
-- Every clinic here is FICTITIOUS: is_demo=true, named 'DEMO Clinic X - Fictitious', no phone/email, no real address,
-- verification_level='demo_fictitious' (never a verified real provider). Facts are deliberately varied, with some
-- 'unknown' and 'unverified' fields and one stale and one never-verified listing, to exercise the UI and matching.
-- Not real Marinduque providers; no real fees, procedures or addresses. Idempotent (on conflict do nothing).
insert into clinics (slug, name, is_demo, description, municipality, address_text, address_verification,
                     contact_note, contact_verification, status, verification_level, verification_source, last_verified_at)
values
  ('demo-clinic-a', 'DEMO Clinic A – Fictitious', true,
   'DEMO placeholder listing. A fictitious clinic used only to test the prototype. Not a real provider.',
   'Boac', 'Fictitious address – not a real location', 'verified',
   'DEMO – no real contact details exist', 'verified',
   'published', 'demo_fictitious', 'demo_fixture', now() - interval '20 days'),
  ('demo-clinic-b', 'DEMO Clinic B – Fictitious', true,
   'DEMO placeholder listing. A fictitious clinic with mixed, partly unconfirmed details.',
   'Mogpog', 'Fictitious address – not a real location', 'unverified',
   'DEMO – no real contact details exist', 'unknown',
   'published', 'demo_fictitious', 'demo_fixture', now() - interval '75 days'),
  ('demo-clinic-c', 'DEMO Clinic C – Fictitious', true,
   'DEMO placeholder listing. A fictitious clinic whose demo verification is old (stale).',
   'Gasan', null, 'unknown',
   'DEMO – no real contact details exist', 'unknown',
   'published', 'demo_fictitious', 'demo_fixture', now() - interval '400 days'),
  ('demo-clinic-d', 'DEMO Clinic D – Fictitious', true,
   'DEMO placeholder listing. A fictitious clinic with almost nothing confirmed.',
   'Santa Cruz', null, 'unknown',
   null, 'unknown',
   'published', 'demo_fictitious', 'demo_fixture', null),
  ('demo-clinic-e', 'DEMO Clinic E – Fictitious', true,
   'DEMO placeholder listing. A fictitious clinic with youth-oriented details in the demo data.',
   'Torrijos', 'Fictitious address – not a real location', 'verified',
   'DEMO – no real contact details exist', 'unverified',
   'published', 'demo_fictitious', 'demo_fixture', now() - interval '60 days'),
  ('demo-clinic-f', 'DEMO Clinic F – Fictitious', true,
   'DEMO placeholder listing. A fictitious clinic with a low-cost testing option in the demo data.',
   'Buenavista', 'Fictitious address – not a real location', 'verified',
   'DEMO – no real contact details exist', 'verified',
   'published', 'demo_fictitious', 'demo_fixture', now() - interval '10 days'),
  ('demo-clinic-g', 'DEMO Clinic G – Fictitious (unpublished)', true,
   'DEMO placeholder listing kept in draft to test the publishing guard. Must never appear publicly.',
   'Boac', null, 'unknown',
   null, 'unknown',
   'draft', 'demo_fictitious', 'demo_fixture', now() - interval '5 days')
on conflict (slug) do nothing;

insert into clinic_services (clinic_id, service_category, availability, verification_status, last_verified_at)
select c.id, v.cat, v.avail, v.ver::verification_status, case when v.ver = 'unknown' then null else c.last_verified_at end
from (values
  ('demo-clinic-a', 'hiv_testing', 'available', 'verified'),
  ('demo-clinic-a', 'sti_testing', 'available', 'verified'),
  ('demo-clinic-a', 'counselling', 'available', 'verified'),
  ('demo-clinic-b', 'sti_testing', 'available', 'verified'),
  ('demo-clinic-b', 'hiv_testing', 'unknown', 'unknown'),
  ('demo-clinic-c', 'hiv_testing', 'available', 'verified'),
  ('demo-clinic-c', 'counselling', 'available', 'verified'),
  ('demo-clinic-d', 'counselling', 'available', 'unverified'),
  ('demo-clinic-e', 'hiv_testing', 'available', 'unverified'),
  ('demo-clinic-e', 'sti_testing', 'unavailable', 'verified'),
  ('demo-clinic-e', 'counselling', 'available', 'verified'),
  ('demo-clinic-f', 'hiv_testing', 'available', 'verified'),
  ('demo-clinic-f', 'sti_testing', 'available', 'verified'),
  ('demo-clinic-g', 'hiv_testing', 'available', 'verified')
) as v(slug, cat, avail, ver)
join clinics c on c.slug = v.slug
on conflict (clinic_id, service_category) do nothing;

-- Fictitious demo fee tiers only; amounts are placeholders, not real prices.
insert into clinic_pricing (clinic_id, service_category, fee_tier, amount_php_min, amount_php_max, pricing_note, verification_status, last_verified_at)
select c.id, v.cat, v.tier, v.pmin, v.pmax, 'DEMO placeholder fee', v.ver::verification_status,
       case when v.ver = 'unknown' then null else c.last_verified_at end
from (values
  ('demo-clinic-a', 'hiv_testing', 'free', null::numeric, null::numeric, 'verified'),
  ('demo-clinic-a', 'sti_testing', 'low', 100::numeric, 300::numeric, 'verified'),
  ('demo-clinic-b', 'sti_testing', 'standard', 800::numeric, 1500::numeric, 'verified'),
  ('demo-clinic-c', 'hiv_testing', 'free', null::numeric, null::numeric, 'verified'),
  ('demo-clinic-e', 'hiv_testing', 'low', 50::numeric, 200::numeric, 'unverified'),
  ('demo-clinic-f', 'hiv_testing', 'free', null::numeric, null::numeric, 'verified'),
  ('demo-clinic-f', 'sti_testing', 'low', 150::numeric, 250::numeric, 'verified')
) as v(slug, cat, tier, pmin, pmax, ver)
join clinics c on c.slug = v.slug
on conflict (clinic_id, service_category) do nothing;

insert into clinic_privacy_practices (clinic_id, practice_key, practice_status, verification_status, last_verified_at)
select c.id, v.key, v.pstat, v.ver::verification_status, case when v.ver = 'unknown' then null else c.last_verified_at end
from (values
  ('demo-clinic-a', 'confidentiality_explained', 'confirmed', 'verified'),
  ('demo-clinic-a', 'reduced_disclosure_booking', 'confirmed', 'verified'),
  ('demo-clinic-a', 'procedure_explained', 'confirmed', 'verified'),
  ('demo-clinic-a', 'youth_friendly', 'unknown', 'unknown'),
  ('demo-clinic-a', 'minors_information', 'unknown', 'unknown'),
  ('demo-clinic-b', 'confidentiality_explained', 'confirmed', 'verified'),
  ('demo-clinic-b', 'reduced_disclosure_booking', 'not_supported', 'verified'),
  ('demo-clinic-b', 'youth_friendly', 'confirmed', 'verified'),
  ('demo-clinic-b', 'minors_information', 'confirmed', 'unverified'),
  ('demo-clinic-c', 'confidentiality_explained', 'confirmed', 'verified'),
  ('demo-clinic-c', 'youth_friendly', 'confirmed', 'verified'),
  ('demo-clinic-e', 'procedure_explained', 'confirmed', 'verified'),
  ('demo-clinic-e', 'minors_information', 'confirmed', 'verified'),
  ('demo-clinic-e', 'youth_friendly', 'confirmed', 'verified'),
  ('demo-clinic-e', 'confidentiality_explained', 'unknown', 'unknown'),
  ('demo-clinic-f', 'confidentiality_explained', 'confirmed', 'verified'),
  ('demo-clinic-f', 'reduced_disclosure_booking', 'unknown', 'unknown'),
  ('demo-clinic-f', 'procedure_explained', 'confirmed', 'verified')
) as v(slug, key, pstat, ver)
join clinics c on c.slug = v.slug
on conflict (clinic_id, practice_key) do nothing;

insert into clinic_verification_records (clinic_id, scope, status, source, verified_at, note)
select c.id, 'listing', 'verified'::verification_status, 'demo_fixture', c.last_verified_at, 'DEMO fixture record; not a real verification'
from clinics c
where c.is_demo and c.last_verified_at is not null
  and not exists (select 1 from clinic_verification_records r where r.clinic_id = c.id and r.scope = 'listing');
