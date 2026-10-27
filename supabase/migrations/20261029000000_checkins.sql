-- Weekly check-ins. Additive only: four new tables, nothing existing is changed.
-- Keyed by Google place_id, because a business can be re-scanned into a new
-- businesses row; business_id points at the latest scan we know of.
-- Server-only like every other table: RLS on, a restrictive deny policy, and no
-- privileges for anon or authenticated (see 20261028000000_harden_rls.sql).

-- Owner opt-in. Only rows with tracked = true are checked on the schedule.
create table if not exists public.tracked_businesses (
  place_id text primary key,
  business_id uuid references public.businesses (id) on delete set null,
  tracked boolean not null default false,
  opted_in_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per business per check-in attempt, including no-change and skipped runs.
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  business_id uuid references public.businesses (id) on delete set null,
  kind text not null check (kind in ('baseline', 'light', 'new_reviews', 'deep')),
  trigger text not null check (trigger in ('cron', 'manual')),
  status text not null check (status in ('ok', 'no_change', 'deferred', 'skipped_budget', 'error')),
  est_cost_usd numeric(10, 5) not null default 0,
  actual_cost_usd numeric(10, 5),
  apify_run_id text,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists checkins_place_idx on public.checkins (place_id, started_at desc);
create index if not exists checkins_started_idx on public.checkins (started_at);

-- What was measured on each check-in. Null means "not measured this time", never zero.
create table if not exists public.checkin_snapshots (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  business_id uuid references public.businesses (id) on delete set null,
  checkin_id uuid references public.checkins (id) on delete set null,
  kind text not null check (kind in ('baseline', 'light', 'new_reviews', 'deep')),
  rating numeric(3, 2),
  review_count integer,
  reply_rate numeric(5, 4),
  reply_sample integer,
  neg_reply_rate numeric(5, 4),
  neg_sample integer,
  complaint_counts jsonb,
  new_reviews integer not null default 0,
  taken_at timestamptz not null default now()
);
create index if not exists checkin_snapshots_place_idx on public.checkin_snapshots (place_id, taken_at desc);

-- New reviews found by check-ins, with their complaint labels.
create table if not exists public.checkin_reviews (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  checkin_id uuid references public.checkins (id) on delete set null,
  external_id text not null,
  rating integer,
  text text not null default '',
  published_at timestamptz,
  owner_response text,
  complaints text[] not null default '{}',
  classified_by text not null check (classified_by in ('llm', 'rules')),
  created_at timestamptz not null default now(),
  unique (place_id, external_id)
);
create index if not exists checkin_reviews_checkin_idx on public.checkin_reviews (checkin_id);

do $$
declare
  t text;
begin
  foreach t in array array['tracked_businesses', 'checkins', 'checkin_snapshots', 'checkin_reviews']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "no client access" on public.%I', t);
    execute format(
      'create policy "no client access" on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      t
    );
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end
$$;
