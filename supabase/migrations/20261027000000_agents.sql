-- Phone agent configs (one per business per generation) and the run stopwatch.

alter table public.runs add column if not exists agent_ready_at timestamptz;
alter table public.runs add column if not exists agent_ready_ms integer;

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  run_id uuid not null references public.runs (id) on delete cascade,
  status text not null default 'ready' check (status in ('ready', 'deployed', 'deploy_failed')),
  -- Zod-validated AgentConfig (src/lib/agent/schema.ts): system prompt, first message, cited knowledge, policies.
  config jsonb not null,
  ready_ms integer,
  provider text,
  external_agent_id text,
  deploy_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agents_business_idx on public.agents (business_id, created_at desc);
create index if not exists agents_run_idx on public.agents (run_id);

alter table public.agents enable row level security;
