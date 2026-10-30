-- 0003_clinics: clinic directory, services, privacy practices, pricing and verification records (KALINGA, DEMO prototype).
-- Safety model:
--  * Production starts with NO clinics. Demo clinics (is_demo=true) are fictitious, loaded only by the dev/test seed,
--    must be named 'DEMO ...', carry no phone/email/real address, and can never hold a real verification level.
--  * A non-demo clinic can be `published` only with a provider-confirmed/verified level, a source and a verification date.
--  * Every fact is tri-state (verified / unknown / unverified); `unknown` is never rendered as safe.
--  * No test results, diagnoses or patient data live in these tables.

create type verification_status as enum ('verified', 'unknown', 'unverified');
create type clinic_publish_status as enum ('draft', 'in_review', 'published', 'unpublished');

create table clinics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name text not null check (length(name) between 1 and 200),
  -- true = fictitious dev/test fixture; never a real provider.
  is_demo boolean not null default false,
  description text check (description is null or length(description) <= 1000),
  -- Marinduque has exactly these six municipalities.
  municipality text not null check (municipality in ('Boac', 'Buenavista', 'Gasan', 'Mogpog', 'Santa Cruz', 'Torrijos')),
  barangay text check (barangay is null or length(barangay) <= 120),
  address_text text check (address_text is null or length(address_text) <= 300),
  address_verification verification_status not null default 'unknown',
  phone text check (phone is null or length(phone) <= 40),
  email text check (email is null or length(email) <= 200),
  contact_note text check (contact_note is null or length(contact_note) <= 300),
  contact_verification verification_status not null default 'unknown',
  status clinic_publish_status not null default 'draft',
  -- Whole-listing verification level. 'demo_fictitious' is reserved for is_demo rows.
  verification_level text not null default 'unverified'
    check (verification_level in ('demo_fictitious', 'unverified', 'provider_confirmed', 'verified_real')),
  verification_source text check (verification_source is null or length(verification_source) <= 300),
  last_verified_at timestamptz,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Demo clinics are unmistakably fictitious and carry no real-world contact data.
  constraint clinics_demo_is_fictitious check (
    not is_demo or (
      verification_level = 'demo_fictitious'
      and name like 'DEMO %'
      and phone is null
      and email is null
      and (address_text is null or address_text ilike '%fictitious%')
    )
  ),
  -- The demo level cannot be used by a real clinic, and a demo clinic can never be provider_confirmed/verified_real.
  constraint clinics_real_not_demo_level check (is_demo or verification_level <> 'demo_fictitious'),
  -- Publishing guard: real clinics are public only with documented verification (level, source and date).
  constraint clinics_published_requires_verification check (
    status <> 'published'
    or is_demo
    or (
      verification_level in ('provider_confirmed', 'verified_real')
      and verification_source is not null
      and last_verified_at is not null
    )
  )
);

create index clinics_status_municipality_idx on clinics (status, municipality);

create table clinic_services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  service_category text not null
    check (service_category in ('hiv_testing', 'sti_testing', 'counselling', 'treatment_followup', 'referral')),
  availability text not null default 'unknown' check (availability in ('available', 'unavailable', 'unknown')),
  verification_status verification_status not null default 'unknown',
  last_verified_at timestamptz,
  notes text check (notes is null or length(notes) <= 300),
  unique (clinic_id, service_category)
);
create index clinic_services_clinic_idx on clinic_services (clinic_id);

create table clinic_privacy_practices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  practice_key text not null check (practice_key in (
    'confidentiality_explained', 'reduced_disclosure_booking', 'youth_friendly', 'procedure_explained', 'minors_information'
  )),
  -- The claimed fact, and (separately) how well it is evidenced. Only confirmed+verified counts as a positive fact.
  practice_status text not null default 'unknown' check (practice_status in ('confirmed', 'unknown', 'not_supported')),
  verification_status verification_status not null default 'unknown',
  last_verified_at timestamptz,
  notes text check (notes is null or length(notes) <= 300),
  unique (clinic_id, practice_key)
);
create index clinic_privacy_practices_clinic_idx on clinic_privacy_practices (clinic_id);

create table clinic_pricing (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  service_category text not null
    check (service_category in ('hiv_testing', 'sti_testing', 'counselling', 'treatment_followup', 'referral')),
  fee_tier text not null default 'unknown' check (fee_tier in ('free', 'low', 'standard', 'unknown')),
  amount_php_min numeric(10, 2) check (amount_php_min is null or amount_php_min >= 0),
  amount_php_max numeric(10, 2) check (amount_php_max is null or amount_php_max >= 0),
  pricing_note text check (pricing_note is null or length(pricing_note) <= 300),
  verification_status verification_status not null default 'unknown',
  last_verified_at timestamptz,
  unique (clinic_id, service_category),
  constraint clinic_pricing_range check (amount_php_min is null or amount_php_max is null or amount_php_min <= amount_php_max),
  -- An unknown fee tier cannot be marked verified.
  constraint clinic_pricing_unknown_not_verified check (fee_tier <> 'unknown' or verification_status <> 'verified')
);
create index clinic_pricing_clinic_idx on clinic_pricing (clinic_id);

-- Append-only history of verification events (who/what source/when), per scope of the listing.
create table clinic_verification_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  scope text not null check (scope in ('listing', 'contact', 'services', 'privacy', 'pricing')),
  status verification_status not null,
  source text not null check (length(source) between 1 and 300),
  verified_at timestamptz not null,
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now()
);
create index clinic_verification_records_clinic_idx on clinic_verification_records (clinic_id);

-- Demo clinics may only carry the demo-fixture source: a fictitious clinic can never accumulate "real" evidence.
create function clinic_verification_demo_guard() returns trigger language plpgsql as $$
declare
  demo boolean;
begin
  select is_demo into demo from clinics where id = new.clinic_id;
  if demo and new.source <> 'demo_fixture' then
    raise exception 'demo clinics can only have demo_fixture verification records';
  end if;
  return new;
end;
$$;

create trigger clinic_verification_demo_guard
  before insert or update on clinic_verification_records
  for each row execute function clinic_verification_demo_guard();

-- Prevent flipping a clinic to demo or real after the fact in a way that bypasses the guards above.
create function clinic_origin_guard() returns trigger language plpgsql as $$
begin
  if new.is_demo is distinct from old.is_demo and exists (
    select 1 from clinic_verification_records where clinic_id = new.id and (new.is_demo and source <> 'demo_fixture')
  ) then
    raise exception 'a clinic with real verification records cannot be marked demo';
  end if;
  return new;
end;
$$;

create trigger clinic_origin_guard
  before update of is_demo on clinics
  for each row execute function clinic_origin_guard();

-- ---------------------------------------------------------------------------------------------------------------
-- Row Level Security. The API connects as the table owner (PGlite has a single superuser, which bypasses RLS), and
-- its repository applies the SAME predicate explicitly; these policies are defence in depth for Supabase, where the
-- public/anon path runs as the role below. `kalinga_public` is the read-only public role: it sees only published
-- clinics, and demo clinics only when the session setting `kalinga.demo_mode` is 'true'. It has no access to
-- clinic_verification_records (internal audit trail) and no write access anywhere.
-- ---------------------------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kalinga_public') then
    create role kalinga_public nologin;
  end if;
end
$$;

alter table clinics enable row level security;
alter table clinic_services enable row level security;
alter table clinic_privacy_practices enable row level security;
alter table clinic_pricing enable row level security;
alter table clinic_verification_records enable row level security;

grant usage on schema public to kalinga_public;
grant select on clinics, clinic_services, clinic_privacy_practices, clinic_pricing to kalinga_public;

create policy clinics_public_read on clinics for select to kalinga_public
  using (status = 'published' and (not is_demo or current_setting('kalinga.demo_mode', true) = 'true'));

create policy clinic_services_public_read on clinic_services for select to kalinga_public
  using (exists (select 1 from clinics c where c.id = clinic_id));
create policy clinic_privacy_practices_public_read on clinic_privacy_practices for select to kalinga_public
  using (exists (select 1 from clinics c where c.id = clinic_id));
create policy clinic_pricing_public_read on clinic_pricing for select to kalinga_public
  using (exists (select 1 from clinics c where c.id = clinic_id));
-- clinic_verification_records: RLS enabled and deliberately NO public policy (deny by default for kalinga_public).

comment on table clinics is 'Directory listings. is_demo rows are fictitious fixtures; production starts empty.';
comment on table clinic_verification_records is 'Internal append-only verification history; not readable by kalinga_public. The public API returns only clinic-level level/source/date.';
