-- ringring.run Phase 1 schema.
-- All access goes through the server with the service role key.
-- RLS is enabled with no policies, so anon and authenticated clients get nothing.

create extension if not exists pgcrypto;

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  -- 'category': category + city scan. 'name': one business looked up by name (category holds the name).
  search_kind text not null default 'category' check (search_kind in ('category', 'name')),
  category text not null,
  city text not null,
  max_count integer not null check (max_count between 1 and 50),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'completed_with_errors', 'failed')),
  mode jsonb not null default '{}'::jsonb,
  business_count integer not null default 0,
  diagnosed_count integer not null default 0,
  failed_count integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists runs_created_at_idx on public.runs (created_at desc);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  place_id text not null,
  name text not null,
  category text,
  address text,
  city text,
  phone text,
  website text,
  rating numeric(2, 1),
  review_count integer,
  opening_hours jsonb not null default '[]'::jsonb,
  maps_url text,
  owner_response_rate numeric(4, 3),
  scraped_review_count integer not null default 0,
  is_fixture boolean not null default false,
  diagnosis_status text not null default 'pending'
    check (diagnosis_status in ('pending', 'running', 'ok', 'failed')),
  diagnosis_summary text,
  diagnosis_error text,
  opportunity_score integer not null default 0 check (opportunity_score between 0 and 100),
  est_monthly_value integer not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, place_id)
);
create index if not exists businesses_run_rank_idx on public.businesses (run_id, est_monthly_value desc);
-- Each run keeps its own snapshot; (run_id, place_id) dedupes within a run.
-- This index finds every snapshot of one Google place across runs.
create index if not exists businesses_place_idx on public.businesses (place_id, created_at desc);

create table if not exists public.run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete cascade,
  step text not null,
  status text not null check (status in ('running', 'ok', 'retry', 'warn', 'error', 'skipped')),
  message text not null default '',
  attempt integer not null default 1,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists run_steps_run_idx on public.run_steps (run_id, created_at);
create index if not exists run_steps_business_idx on public.run_steps (business_id);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  external_id text,
  rating smallint check (rating between 1 and 5),
  text text not null,
  published_at timestamptz,
  owner_response text,
  position integer not null default 0
);
create index if not exists reviews_business_idx on public.reviews (business_id, position);

create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  run_id uuid not null references public.runs (id) on delete cascade,
  kind text not null
    check (kind in ('missed_calls', 'slow_response', 'booking_friction', 'unanswered_reviews', 'no_website')),
  title text not null,
  detail text not null,
  severity smallint not null check (severity between 1 and 5),
  solution text not null
    check (solution in ('ai_receptionist', 'review_responder', 'landing_page', 'booking_followup')),
  -- Array of {source:'review', review_id, quote, rating}, {source:'website', page_id, url, quote},
  -- or {source:'listing', fact, value}. Review and website quotes are verified as substrings
  -- of the stored review or page text before insert.
  evidence jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  created_at timestamptz not null default now()
);
create index if not exists findings_business_idx on public.findings (business_id);

create table if not exists public.roi_estimates (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null unique references public.findings (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Array of {key, label, value, unit, source, note}. monthly_value = product of values.
  assumptions jsonb not null,
  formula text not null,
  monthly_value integer not null default 0 check (monthly_value >= 0),
  is_edited boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists roi_business_idx on public.roi_estimates (business_id);

-- Homepage text read by the "read website" step. Findings cite it by page id.
create table if not exists public.web_pages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  url text not null,
  final_url text,
  status text not null check (status in ('ok', 'failed', 'skipped')),
  http_status integer,
  title text,
  text text not null default '',
  error text,
  fetched_at timestamptz not null default now()
);
create index if not exists web_pages_business_idx on public.web_pages (business_id);

-- Per-business facts with sources. Raw material for a later voice agent
-- knowledge pack (hours, services, prices, FAQs). Phase 1 fills listing facts
-- and labeled homepage lines; nothing here calls anyone.
create table if not exists public.knowledge_facts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('contact', 'hours', 'service', 'price', 'faq', 'policy', 'service_area')),
  label text not null,
  value text not null,
  source_type text not null check (source_type in ('listing', 'website', 'review', 'owner')),
  -- Listing field name, web_pages.id, or reviews.id.
  source_ref text not null,
  -- Verbatim supporting text for website and review sources.
  quote text,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_facts_business_idx on public.knowledge_facts (business_id, kind);

alter table public.runs enable row level security;
alter table public.run_steps enable row level security;
alter table public.businesses enable row level security;
alter table public.reviews enable row level security;
alter table public.findings enable row level security;
alter table public.roi_estimates enable row level security;
alter table public.web_pages enable row level security;
alter table public.knowledge_facts enable row level security;
