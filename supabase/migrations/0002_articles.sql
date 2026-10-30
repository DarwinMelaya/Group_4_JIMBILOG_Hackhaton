-- 0002_articles: STI Information Hub content with a per-locale editorial/review lifecycle (KALINGA, DEMO prototype).
-- Publish safety is enforced here (CHECK constraints) AND in the public API query. Nothing in this prototype is
-- medically reviewed: demo rows are flagged content_origin='demo' and can never reach medically_reviewed/published.

create type article_review_state as enum ('draft', 'in_review', 'medically_reviewed', 'published');

create table articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  topic text not null check (topic in (
    'basics', 'common-stis', 'symptoms', 'transmission', 'prevention', 'testing', 'treatment-followup',
    'privacy', 'myths-faq', 'clinic-expectations', 'seek-professional', 'urgent-exposure'
  )),
  -- Marks the separate urgent possible-recent-exposure path.
  is_urgent boolean not null default false,
  -- 'demo' = fictitious placeholder (dev/test seed only); 'editorial' = real workflow content.
  content_origin text not null default 'editorial' check (content_origin in ('editorial', 'demo')),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table article_localizations (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles (id) on delete cascade,
  locale text not null check (locale in ('en', 'fil')),
  version integer not null default 1 check (version >= 1),
  title text not null check (length(title) between 1 and 200),
  summary text not null check (length(summary) between 1 and 600),
  -- Ordered array of {heading, text}.
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  -- Array of {label, note?}; real citations are required before medical review.
  "references" jsonb not null default '[]'::jsonb check (jsonb_typeof("references") = 'array'),
  translation_provenance text not null default 'original' check (length(translation_provenance) <= 200),
  review_state article_review_state not null default 'draft',
  -- Each locale carries its OWN reviewer and date; Filipino never inherits English approval.
  reviewer_name text check (reviewer_name is null or length(reviewer_name) between 1 and 200),
  medically_reviewed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, locale),
  -- Publish safety: medically reviewed/published localizations require a named human reviewer and review date.
  constraint article_loc_review_requires_reviewer check (
    review_state not in ('medically_reviewed', 'published')
    or (reviewer_name is not null and medically_reviewed_at is not null)
  )
);

create index article_localizations_article_idx on article_localizations (article_id);

-- Demo content can never be presented as reviewed: it must stay draft/in_review with no reviewer.
-- Done with a trigger because the rule spans both tables.
create function article_loc_demo_guard() returns trigger language plpgsql as $$
declare
  origin text;
begin
  select content_origin into origin from articles where id = new.article_id;
  if origin = 'demo' and (
    new.review_state in ('medically_reviewed', 'published')
    or new.reviewer_name is not null
    or new.medically_reviewed_at is not null
  ) then
    raise exception 'demo articles cannot be medically reviewed or published';
  end if;
  return new;
end;
$$;

create trigger article_loc_demo_guard
  before insert or update on article_localizations
  for each row execute function article_loc_demo_guard();

-- Prevent flipping an article to demo-safe/unsafe origin after localizations exist in an inconsistent state.
create function article_origin_guard() returns trigger language plpgsql as $$
begin
  if new.content_origin = 'demo' and exists (
    select 1 from article_localizations
    where article_id = new.id
      and (review_state in ('medically_reviewed', 'published') or reviewer_name is not null)
  ) then
    raise exception 'an article with reviewed localizations cannot be marked demo';
  end if;
  return new;
end;
$$;

create trigger article_origin_guard
  before update of content_origin on articles
  for each row execute function article_origin_guard();

comment on table articles is 'STI Information Hub articles. content_origin=demo rows are fictitious placeholders.';
comment on table article_localizations is 'Per-locale content with its own review state, reviewer and date.';
