-- "Talk to Ringy" channel opt-ins. Additive only: one new table.
-- Append-only consent log: each save is a new row with the exact consent text the
-- owner agreed to and when. The latest row per business and channel is the
-- current preference; a withdrawal is a row with status = 'withdrawn'.
-- Nothing in the app sends on these channels: phone, SMS and WhatsApp are not
-- built, and a waitlist row never triggers a message.
-- Server-only like every other table: RLS on, a restrictive deny policy, and no
-- privileges for anon or authenticated (see 20261028000000_harden_rls.sql).

create table if not exists public.channel_optins (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel text not null check (channel in ('browser_voice', 'email', 'phone', 'sms', 'whatsapp')),
  status text not null check (status in ('opted_in', 'waitlist', 'withdrawn')),
  contact text,
  consent_text text not null,
  consent_version text not null,
  consented_at timestamptz not null default now(),
  source text not null default 'talk_to_ringy',
  created_at timestamptz not null default now()
);
create index if not exists channel_optins_business_idx on public.channel_optins (business_id, channel, consented_at desc);

alter table public.channel_optins enable row level security;
drop policy if exists "no client access" on public.channel_optins;
create policy "no client access" on public.channel_optins as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on table public.channel_optins from anon, authenticated;
