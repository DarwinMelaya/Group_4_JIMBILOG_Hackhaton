-- 0006_governance: partner verification evidence, staff invites and the minor-SOP clinic mapping (KALINGA, DEMO prototype).
-- Safety model:
--  * Evidence rows hold an identifier or document REFERENCE only (short, restricted character set) - never file contents.
--  * Fictitious DEMO clinics can never hold real verification evidence or a minor-SOP mapping (trigger guards).
--  * Invite codes are stored only as SHA-256 hashes; an invite is single use and expires.
--  * A minor-SOP mapping is a RECORD only. It does not enable real 15-17 booking: the booking policy stays fail-closed
--    behind REAL_MINOR_BOOKING_ENABLED (forbidden by env.ts) and approved evidence wiring that does not exist yet.
--  * RLS is enabled deny-by-default on every new table; the API connects as owner and applies explicit role checks.

-- Governance audit targets (0005 allowed only booking_request, staff_session, staff_user).
alter table audit_events drop constraint audit_events_target_type_check;
alter table audit_events add constraint audit_events_target_type_check check (target_type in (
  'booking_request', 'staff_session', 'staff_user',
  'clinic', 'clinic_evidence', 'article_localization', 'staff_invite', 'staff_membership', 'minor_sop_mapping'
));

create table clinic_verification_evidence (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  evidence_type text not null check (evidence_type in (
    'partnership_agreement', 'service_confirmation', 'fee_confirmation', 'privacy_practice_confirmation'
  )),
  -- Identifier / document reference such as 'MOA-2026-017'. NOT a file, URL payload or free text.
  evidence_reference text not null check (evidence_reference ~ '^[A-Za-z0-9][A-Za-z0-9 ._:/#-]{2,119}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'expired')),
  recorded_by uuid not null,
  verified_by uuid,
  verified_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_evidence_accepted_has_reviewer check (status <> 'accepted' or (verified_by is not null and verified_at is not null)),
  constraint clinic_evidence_expiry_after_creation check (expires_at > created_at)
);
create index clinic_verification_evidence_clinic_idx on clinic_verification_evidence (clinic_id, status);

create function clinic_evidence_demo_guard() returns trigger language plpgsql as $$
declare
  demo boolean;
begin
  select is_demo into demo from clinics where id = new.clinic_id;
  if demo then
    raise exception 'demo clinics cannot hold real verification evidence';
  end if;
  return new;
end;
$$;
create trigger clinic_evidence_demo_guard before insert or update on clinic_verification_evidence
  for each row execute function clinic_evidence_demo_guard();

create table staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) between 3 and 200 and email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  role staff_role not null,
  clinic_id uuid references clinics (id) on delete cascade,
  -- SHA-256 (hex) of the 256-bit random invite code; the code itself is never stored.
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references staff_users (id) on delete set null,
  revoked_at timestamptz,
  constraint staff_invites_expiry check (expires_at > created_at),
  -- Clinic roles belong to one clinic; provincial/technical admins hold no clinic membership.
  constraint staff_invites_scope check (
    (role in ('clinic_staff', 'clinic_admin') and clinic_id is not null)
    or (role in ('provincial_admin', 'technical_admin') and clinic_id is null)
  )
);
create index staff_invites_clinic_idx on staff_invites (clinic_id);

create table minor_sop_mappings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  sop_artifact_reference text not null check (sop_artifact_reference ~ '^[A-Za-z0-9][A-Za-z0-9 ._:/#-]{2,119}$'),
  sop_version text not null check (sop_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  approved_by text not null check (length(approved_by) between 2 and 120),
  approved_at date not null,
  effective_from date not null,
  status text not null default 'recorded' check (status in ('recorded', 'revoked')),
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  constraint minor_sop_effective_after_approval check (effective_from >= approved_at)
);
create index minor_sop_mappings_clinic_idx on minor_sop_mappings (clinic_id, status);

create function minor_sop_demo_guard() returns trigger language plpgsql as $$
declare
  demo boolean;
begin
  select is_demo into demo from clinics where id = new.clinic_id;
  if demo then
    raise exception 'demo clinics cannot be mapped to a minor SOP';
  end if;
  return new;
end;
$$;
create trigger minor_sop_demo_guard before insert or update on minor_sop_mappings
  for each row execute function minor_sop_demo_guard();

-- Deny by default: no policy and no grant for kalinga_public or kalinga_staff on any of these tables.
alter table clinic_verification_evidence enable row level security;
alter table staff_invites enable row level security;
alter table minor_sop_mappings enable row level security;

comment on table clinic_verification_evidence is 'Partner verification evidence REFERENCES (identifiers only, no file contents). Required to publish a non-demo clinic.';
comment on table staff_invites is 'Single-use staff invitations; only the SHA-256 of the code is stored. Delivery is mock-only in this prototype.';
comment on table minor_sop_mappings is 'Record of an approved minor SOP mapped to a clinic. Recording does NOT enable real 15-17 booking.';
