-- 0005_staff: staff identity (DEV-EQUIVALENT auth, gap G-AUTH), clinic memberships, server-side sessions, audit log,
-- and the clinic-supplied decision fields on booking requests (KALINGA, DEMO prototype).
-- Safety model:
--  * Passwords are stored only as scrypt hashes with a per-user random salt. No plaintext password, no real e-mail address
--    is ever committed: DEMO accounts are created at seed time by the application (apps/api/src/staff/demo-seed.ts),
--    use obviously fake `@demo.invalid` addresses, and are flagged is_demo.
--  * Session tokens are opaque 256-bit random values; only their SHA-256 hash is stored (a database read cannot be
--    replayed as a cookie). The CSRF token is session-bound and also stored only as a hash.
--  * A staff member sees only clinics they have an ACTIVE membership of; technical/provincial admins are not
--    clinic booking readers (separation of duty) and hold no clinic membership.
--  * audit_events is append-only and metadata is redacted by design (application allow-list) and by a database guard:
--    it never holds booking secrets, contact details, e-mail addresses or free-text notes.
--  * RLS is enabled everywhere and DENY-BY-DEFAULT: kalinga_public has no access to any table here. The API connects as
--    the owner and applies the same predicates explicitly (checked on every request); the kalinga_staff policies below
--    are defence in depth and are exercised in tests with `set role kalinga_staff` plus the session setting
--    `kalinga.staff_user_id`.

create type staff_role as enum ('clinic_staff', 'clinic_admin', 'provincial_admin', 'technical_admin');

create table staff_users (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) between 3 and 200 and email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  display_name text not null check (length(display_name) between 1 and 100),
  -- 'scrypt$N$r$p$<salt>$<hash>' (per-user salt). Never selectable by kalinga_staff.
  password_hash text not null check (password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'),
  role staff_role not null,
  active boolean not null default true,
  -- Login throttling: consecutive failures and a temporary lock (never reveals itself to the client).
  failed_login_count integer not null default 0 check (failed_login_count >= 0),
  last_failed_login_at timestamptz,
  locked_until timestamptz,
  last_login_at timestamptz,
  -- DEMO accounts are fictitious, use the reserved .invalid TLD and cannot sign in outside DEMO_MODE.
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_users_demo_email check (not is_demo or email like '%@demo.invalid')
);
-- E-mail is unique case-insensitively (stored lower-cased; the index also protects direct SQL inserts).
create unique index staff_users_email_ci on staff_users (lower(email));

create table clinic_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references staff_users (id) on delete cascade,
  clinic_id uuid not null references clinics (id) on delete cascade,
  -- Only clinic-level roles: provincial/technical admins never get a clinic membership (and so no booking access).
  role staff_role not null check (role in ('clinic_staff', 'clinic_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, clinic_id)
);
create index clinic_memberships_clinic_idx on clinic_memberships (clinic_id);

create table staff_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references staff_users (id) on delete cascade,
  -- SHA-256 (hex) of the opaque random session token; the token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- SHA-256 (hex) of the session-bound CSRF token.
  csrf_hash text not null check (csrf_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Absolute expiry; an idle timeout is applied on top by the API from last_seen_at.
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint staff_sessions_expiry check (expires_at > created_at)
);
create index staff_sessions_user_idx on staff_sessions (user_id);
create index staff_sessions_expiry_idx on staff_sessions (expires_at);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Actor is a plain id (no foreign key) so history survives account removal. null = anonymous or system.
  actor_user_id uuid,
  actor_kind text not null check (actor_kind in ('staff', 'system', 'anonymous')),
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$' and length(action) <= 64),
  target_type text not null check (target_type in ('booking_request', 'staff_session', 'staff_user')),
  target_id uuid,
  clinic_id uuid,
  -- Redacted by design: small flat object of ids, statuses, versions and booleans only.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and length(metadata::text) <= 600),
  -- Defence in depth: refuse metadata that looks like it carries secrets, contacts, references or free text.
  constraint audit_events_metadata_redacted
    check (metadata::text !~* '(secret|password|passwd|token|e-?mail|phone|reference|contact|hash|cookie|note|instruction|name)')
);
create index audit_events_clinic_idx on audit_events (clinic_id, created_at);
create index audit_events_target_idx on audit_events (target_type, target_id);

-- Append-only: audit rows can be neither changed nor removed through normal SQL (retention is a separate, approved job).
create function audit_events_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;
create trigger audit_events_no_update before update or delete on audit_events
  for each row execute function audit_events_append_only();

-- Clinic-supplied decision fields on booking requests. clinic_note (<= 300) and visit_instructions (<= 500) already exist
-- from 0004 and are exactly what the public status lookup shows; these add the structured times and decision stamp.
alter table booking_requests
  add column visit_starts_at timestamptz,
  add column alternative_starts_at timestamptz,
  add column decided_by uuid,
  add column decided_at timestamptz;
create index booking_requests_status_created_idx on booking_requests (status, created_at);

-- ---------------------------------------------------------------------------------------------------------------
-- Row Level Security: deny by default.
-- ---------------------------------------------------------------------------------------------------------------
alter table staff_users enable row level security;
alter table clinic_memberships enable row level security;
alter table staff_sessions enable row level security;
alter table audit_events enable row level security;
alter table booking_requests enable row level security; -- already enabled by 0004; restated for clarity

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kalinga_staff') then
    create role kalinga_staff nologin;
  end if;
end
$$;

-- kalinga_public: no grants and no policies on any of these tables (and none on booking_requests) => denied.

grant usage on schema public to kalinga_staff;

-- The authenticated actor is passed by the API as a session setting; there is no client-supplied role.
-- (Supabase equivalent: auth.uid(); gap G-AUTH.)
create function kalinga_current_staff_user() returns uuid language sql stable as $$
  select nullif(current_setting('kalinga.staff_user_id', true), '')::uuid
$$;

-- staff_users: a staff member may read their own non-secret columns (never password_hash or lock counters).
grant select (id, email, display_name, role, active, is_demo) on staff_users to kalinga_staff;
create policy staff_users_self_read on staff_users for select to kalinga_staff using (id = kalinga_current_staff_user());

-- clinic_memberships: own rows only.
grant select on clinic_memberships to kalinga_staff;
create policy clinic_memberships_self_read on clinic_memberships for select to kalinga_staff
  using (user_id = kalinga_current_staff_user());

-- staff_sessions: no policy and no grant for kalinga_staff (sessions are managed by the API only).

-- audit_events: kalinga_staff may append rows attributed to itself; it cannot read the log (an admin view is a later slice).
grant insert on audit_events to kalinga_staff;
create policy audit_events_staff_insert on audit_events for insert to kalinga_staff
  with check (actor_kind = 'staff' and actor_user_id = kalinga_current_staff_user());

-- booking_requests: only rows of clinics where the actor holds an ACTIVE clinic-level membership, only non-secret
-- columns (secret_hash and secret_key_version are not granted), and updates limited to the decision columns.
grant select (id, reference, clinic_id, status, preferred_date, preferred_window, service_category, contact_preference,
              notes, age_band, is_demo, is_demo_minor_flow, clinic_note, visit_instructions, version, created_at,
              updated_at, retention_expires_at, visit_starts_at, alternative_starts_at, decided_by, decided_at)
  on booking_requests to kalinga_staff;
grant update (status, clinic_note, visit_instructions, visit_starts_at, alternative_starts_at, decided_by, decided_at,
              version, updated_at)
  on booking_requests to kalinga_staff;

create policy booking_requests_staff_read on booking_requests for select to kalinga_staff
  using (exists (
    select 1 from clinic_memberships m
    where m.user_id = kalinga_current_staff_user() and m.clinic_id = booking_requests.clinic_id and m.active
  ));
create policy booking_requests_staff_update on booking_requests for update to kalinga_staff
  using (exists (
    select 1 from clinic_memberships m
    where m.user_id = kalinga_current_staff_user() and m.clinic_id = booking_requests.clinic_id and m.active
  ))
  with check (exists (
    select 1 from clinic_memberships m
    where m.user_id = kalinga_current_staff_user() and m.clinic_id = booking_requests.clinic_id and m.active
  ));

comment on table staff_users is 'DEV-EQUIVALENT staff identities (gap G-AUTH: replace with Supabase Auth before real use). scrypt hashes only.';
comment on table staff_sessions is 'Opaque session tokens stored as SHA-256 hashes only.';
comment on table audit_events is 'Append-only, redacted audit trail. Never holds secrets, contact details or free-text notes.';
