-- 0004_bookings: confidential, clinic-specific booking REQUESTS (KALINGA, DEMO prototype).
-- Safety model:
--  * A row here is a REQUEST for a preferred date/time window, never a reservation or a confirmed appointment.
--  * The access secret is NEVER stored. Only an HMAC-SHA256 verifier (hex) of the 256-bit secret is kept; the public
--    reference alone cannot retrieve anything. Idempotency keys and lookup references are stored only as HMAC hashes.
--  * Minimal data: age BAND (never a date of birth), an optional contact PREFERENCE (no contact details are collected),
--    optional short notes. No symptoms, HIV status, test results, sexual history or ID.
--  * Real under-18 requests fail closed: under_15 is never storable, and 15_17 is storable only as an explicitly
--    labelled DEMO minor flow against a DEMO clinic (no approved minor SOP artifact exists in this repo).
--  * RLS is enabled everywhere and kalinga_public is DENIED by default on all request, key and attempt tables.

create type booking_status as enum ('pending', 'confirmed', 'alternative_offered', 'cancelled', 'expired');
create type booking_age_band as enum ('under_15', '15_17', '18_plus');

-- Per-clinic booking configuration: which optional fields exist and the disclosure shown BEFORE anything is collected.
create table clinic_booking_config (
  clinic_id uuid primary key references clinics (id) on delete cascade,
  enabled boolean not null default false,
  method text not null default 'request_only' check (method = 'request_only'),
  -- Field modes. age band and preferred date/window are always collected (they are the request itself).
  service_mode text not null default 'optional' check (service_mode in ('hidden', 'optional', 'required')),
  contact_preference_mode text not null default 'hidden' check (contact_preference_mode in ('hidden', 'optional', 'required')),
  notes_mode text not null default 'optional' check (notes_mode in ('hidden', 'optional', 'required')),
  notes_max_length integer not null default 200 check (notes_max_length between 20 and 500),
  low_disclosure_supported boolean not null default false,
  -- Disclosure shown before collection: why the data is needed, who receives it, how to cancel.
  disclosure_purpose text not null check (length(disclosure_purpose) between 1 and 600),
  disclosure_recipient text not null check (length(disclosure_recipient) between 1 and 300),
  disclosure_cancellation text not null check (length(disclosure_cancellation) between 1 and 400),
  min_advance_days integer not null default 1 check (min_advance_days between 0 and 30),
  max_advance_days integer not null default 30 check (max_advance_days between 1 and 90),
  -- Configurable retention (no universal period is invented; the demo value is a placeholder).
  retention_days integer not null default 30 check (retention_days between 1 and 365),
  updated_at timestamptz not null default now(),
  constraint clinic_booking_config_window check (min_advance_days <= max_advance_days)
);

create table booking_requests (
  id uuid primary key default gen_random_uuid(),
  -- Public, NON-secret reference: 'KAL-' + 10 base32 characters (CSPRNG). It cannot retrieve anything on its own.
  reference text not null unique check (reference ~ '^KAL-[A-Z2-7]{10}$'),
  -- HMAC-SHA256 (hex) of the independent 256-bit access secret. The secret itself is never stored.
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  secret_key_version smallint not null default 1,
  clinic_id uuid not null references clinics (id) on delete restrict,
  status booking_status not null default 'pending',
  -- Preference only: a requested local (Asia/Manila) date and window. No slot, no availability, no reservation.
  preferred_date date not null,
  preferred_window text not null check (preferred_window in ('morning', 'afternoon', 'any')),
  service_category text check (service_category is null
    or service_category in ('hiv_testing', 'sti_testing', 'counselling', 'treatment_followup', 'referral')),
  -- A preference for how to be reached. No phone, email or name is collected in this prototype.
  contact_preference text check (contact_preference is null or contact_preference in ('none', 'phone_call', 'sms', 'email')),
  notes text check (notes is null or length(notes) <= 500),
  age_band booking_age_band not null,
  is_demo boolean not null,
  is_demo_minor_flow boolean not null default false,
  -- Fields the clinic fills in later (S6): neutral, clinic-supplied only.
  clinic_note text check (clinic_note is null or length(clinic_note) <= 300),
  visit_instructions text check (visit_instructions is null or length(visit_instructions) <= 500),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retention_expires_at timestamptz not null,

  -- Under-15 requests are never stored.
  constraint booking_requests_no_under_15 check (age_band <> 'under_15'),
  -- Real (non-demo) minor requests are impossible without an approved SOP: a 15-17 row must be a DEMO minor flow.
  constraint booking_requests_minor_demo_only check (age_band <> '15_17' or (is_demo and is_demo_minor_flow)),
  constraint booking_requests_demo_minor_consistent check (not is_demo_minor_flow or (is_demo and age_band = '15_17'))
);
create index booking_requests_clinic_status_idx on booking_requests (clinic_id, status);
create index booking_requests_retention_idx on booking_requests (retention_expires_at);

-- A request's demo flag must always match its clinic's: demo clinics only hold demo requests and vice versa.
create function booking_requests_demo_guard() returns trigger language plpgsql as $$
declare
  demo boolean;
begin
  select is_demo into demo from clinics where id = new.clinic_id;
  if demo is distinct from new.is_demo then
    raise exception 'booking request demo flag must match its clinic';
  end if;
  return new;
end;
$$;

create trigger booking_requests_demo_guard
  before insert or update of clinic_id, is_demo on booking_requests
  for each row execute function booking_requests_demo_guard();

-- Short-lived idempotency keys. Only an HMAC of the client key is stored; the same key + same body replays the
-- original outcome WITHOUT revealing the secret again; the same key + a different body is rejected.
create table idempotency_keys (
  scope text not null check (scope in ('booking_request')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  booking_request_id uuid not null references booking_requests (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (scope, key_hash)
);
create index idempotency_keys_expiry_idx on idempotency_keys (expires_at);

-- Lookup throttling, keyed by an HMAC of the submitted reference (known or unknown alike, so throttling is not an oracle).
create table lookup_attempts (
  reference_hash text primary key check (reference_hash ~ '^[0-9a-f]{64}$'),
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  -- Rows are disposable: removed once this passes.
  expires_at timestamptz not null
);
create index lookup_attempts_expiry_idx on lookup_attempts (expires_at);

-- ---------------------------------------------------------------------------------------------------------------
-- Row Level Security (defence in depth; the API connects as the owner and applies the same predicates explicitly).
-- kalinga_public may read only the booking CONFIG of a visible clinic; it has NO access to requests, keys or attempts
-- (RLS enabled with deliberately no policy and no grant).
-- ---------------------------------------------------------------------------------------------------------------
alter table clinic_booking_config enable row level security;
alter table booking_requests enable row level security;
alter table idempotency_keys enable row level security;
alter table lookup_attempts enable row level security;

grant select on clinic_booking_config to kalinga_public;

create policy clinic_booking_config_public_read on clinic_booking_config for select to kalinga_public
  using (enabled and exists (select 1 from clinics c where c.id = clinic_id));

comment on table booking_requests is 'Confidential REQUESTS (not appointments). secret_hash is an HMAC verifier; the secret is never stored. No diagnoses or results.';
comment on table lookup_attempts is 'Throttling counters keyed by HMAC(reference). Disposable; no personal data.';
