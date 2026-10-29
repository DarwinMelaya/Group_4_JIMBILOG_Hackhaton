-- 0001_baseline: minimal Supabase-compatible Postgres baseline (KALINGA, DEMO prototype).
-- app_config holds non-secret application metadata. No personal data belongs here.
create table app_config (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]*$' and length(key) <= 64),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table app_config is 'Non-secret application metadata. Never store secrets or personal data.';

insert into app_config (key, value) values
  ('schema.baseline', to_jsonb('0001'::text));
