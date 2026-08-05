-- Private-address blocklist.
--
-- The mailbox ingestion pipeline (venues.data_source='email_ingest') extracted the
-- RECIPIENT's postal address out of ingested mail and published it as a venue address.
-- That put a private home address on two live, seo_indexable listings (one of them
-- literally NAMED after the street number) plus their organization rows and search
-- documents. The rows were cleaned; this guard stops the same address from ever being
-- re-listed by any writer — pipeline, admin UI, CSV upload or manual SQL.
--
-- Enforcement is fail-safe, not fail-loud: a matching INSERT is dropped and a matching
-- UPDATE is skipped, both recorded in private_address_blocklist_hits. A RAISE would
-- abort whole ingest batches (a statement timeout / error is a full rollback here).

create table if not exists public.private_address_blocklist (
  id uuid primary key default gen_random_uuid(),
  pattern text not null unique,   -- POSIX regex, matched against the normalized form
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.private_address_blocklist_hits (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  op text not null,
  entity_id uuid,
  matched_pattern text not null,
  blocked_text text not null,
  created_at timestamptz not null default now()
);

alter table public.private_address_blocklist enable row level security;
alter table public.private_address_blocklist_hits enable row level security;

-- No policies + no grants: service_role only. Revoke explicitly — default privileges
-- in this project have armed new relations for anon/authenticated before (PR #2450).
revoke all on public.private_address_blocklist from anon, authenticated;
revoke all on public.private_address_blocklist_hits from anon, authenticated;

-- "Europaallee 40, CH - 8004 Zürich" -> "europaallee 40 ch 8004 zurich"
create or replace function public.private_address_normalize(p_text text)
returns text language sql immutable as $$
  select trim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.private_address_match(p_text text)
returns text language sql stable as $$
  select b.pattern
  from public.private_address_blocklist b
  where p_text is not null and p_text <> ''
    and public.private_address_normalize(p_text) ~ b.pattern
  limit 1
$$;

create or replace function public.guard_private_address()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(new);
  v_candidate text;
  v_pattern text;
begin
  -- Every field a listing can leak the address through: the address itself, the
  -- name (the deleted venue was called "Europaallee 40") and the blurb.
  foreach v_candidate in array array[
    v_row->>'address', v_row->>'address_normalized', v_row->>'name',
    v_row->>'title', v_row->>'venue_name', v_row->>'description'
  ] loop
    v_pattern := public.private_address_match(v_candidate);
    if v_pattern is not null then
      insert into public.private_address_blocklist_hits
        (table_name, op, entity_id, matched_pattern, blocked_text)
      values (tg_table_name, tg_op, (v_row->>'id')::uuid, v_pattern, left(v_candidate, 500));
      return null;  -- INSERT dropped / UPDATE skipped
    end if;
  end loop;
  return new;
end $$;

-- 'zzz_' prefix is load-bearing: BEFORE triggers fire in NAME order, and the geo-derive
-- triggers (trg_*_geo_derive) rewrite address fields. The guard must see the final row.
create trigger zzz_private_address_guard before insert or update on public.venues
  for each row execute function public.guard_private_address();
create trigger zzz_private_address_guard before insert or update on public.events
  for each row execute function public.guard_private_address();
create trigger zzz_private_address_guard before insert or update on public.hotels
  for each row execute function public.guard_private_address();
create trigger zzz_private_address_guard before insert or update on public.organizations
  for each row execute function public.guard_private_address();

-- Word boundaries (\y) so "Europaallee 401" is not caught — only this one address.
insert into public.private_address_blocklist (pattern, note)
values ('\yeuropaallee 40\y', 'Private residence of the site owner. Never list.')
on conflict (pattern) do nothing;
