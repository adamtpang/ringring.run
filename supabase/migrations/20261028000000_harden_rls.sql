-- Harden access for a server-only app.
-- The server talks to Postgres with the service role key, which bypasses RLS.
-- Browsers never query these tables, so anon and authenticated get nothing:
--   1. an explicit restrictive deny policy on every table (documents intent,
--      clears the "RLS enabled, no policy" advisor), and
--   2. no table privileges at all, so even a future permissive policy added by
--      mistake cannot expose rows without a matching grant.
-- Also adds the covering index the performance advisor asked for.

create index if not exists findings_run_idx on public.findings (run_id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'runs', 'run_steps', 'businesses', 'reviews', 'findings',
    'roi_estimates', 'web_pages', 'knowledge_facts', 'agents'
  ]
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
