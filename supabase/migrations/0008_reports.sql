-- 0008_reports: privacy-preserving aggregate reporting (KALINGA, DEMO prototype).
-- No new personal data is stored. Reports are computed on demand from booking_requests (status + created_at + clinic only),
-- with small-cell suppression (< 5 shown as "<5") applied in the API. This migration adds only:
--  * a 'report' audit target so each export leaves an append-only, redacted audit event;
--  * report_settings: a deny-by-default feature switch. Attendance reporting is OFF until an approved decision flips it,
--    and no attendance data is collected by this prototype in any case.

alter table audit_events drop constraint audit_events_target_type_check;
alter table audit_events add constraint audit_events_target_type_check check (target_type in (
  'booking_request', 'staff_session', 'staff_user',
  'clinic', 'clinic_evidence', 'article_localization', 'staff_invite', 'staff_membership', 'minor_sop_mapping',
  'report'
));

create table report_settings (
  key text primary key check (key in ('attendance_reporting_approved')),
  bool_value boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into report_settings (key, bool_value) values ('attendance_reporting_approved', false);
alter table report_settings enable row level security;

comment on table report_settings is 'Feature switches for aggregate reporting. attendance_reporting_approved defaults to false (field omitted from reports).';
