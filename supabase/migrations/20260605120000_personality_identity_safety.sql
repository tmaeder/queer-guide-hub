-- Trust-&-safety remediation: C-2 + H-5 + M-6 (audit docs/audits/2026-06-05-trust-safety-audit.md)
--
-- personalities.lgbti_connection was an uncontrolled free-text identity field.
-- 5,096 living, public people carried the assigned label "Gay adult performer"
-- (an unconsented sexual-identity claim scraped from an adult-content source).
--
-- This migration installs the SCHEMA + invariants. The bulk relabel/demote of
-- existing rows is performed by a batched backfill (see
-- scripts/data-quality/backfill-personality-identity.sh) because the per-row
-- search_documents re-index cascade cannot complete in one transaction.
--
--   (1) lgbti_connection_source: NON-PUBLIC provenance column for the raw label.
--   (2) CHECK constraint enforcing the controlled vocab (added NOT VALID here;
--       VALIDATEd by 20260605120010 once the backfill has cleaned the data).
--   (3) Trigger so setting death_date forces is_living=false (M-6), plus a
--       one-time fix of the existing living-but-dead rows (14 — small/fast).
--
-- Privacy: operates on labels/aggregates only. No individual is named. The harm
-- being fixed is the unconsented identity label itself.

begin;

-- (1) Provenance trail. Never surfaced on public read paths; kept so a human
--     reviewer can see what the original scrape asserted.
alter table public.personalities
  add column if not exists lgbti_connection_source text;

comment on column public.personalities.lgbti_connection_source is
  'Raw, pre-remediation lgbti_connection free-text (provenance / human-review trail). NOT for public display — may contain unconsented scrape labels.';

-- (2) Enforce the controlled vocab. NULL is allowed and means "no claim".
--     NOT VALID so existing (still-raw) rows are not checked until the batched
--     backfill has remapped them; 20260605120010 VALIDATEs afterwards.
alter table public.personalities
  drop constraint if exists personalities_lgbti_connection_vocab;
alter table public.personalities
  add constraint personalities_lgbti_connection_vocab
  check (
    lgbti_connection is null
    or lgbti_connection in
      ('community_member', 'ally', 'activist', 'representation', 'none_known', 'unclear')
  ) not valid;

-- (3) death_date implies not-living. Forward-looking trigger + one-time backfill
--     (only ~14 rows, completes instantly).
create or replace function public.personalities_death_implies_not_living()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.death_date is not null then
    new.is_living := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_personalities_death_implies_not_living on public.personalities;
create trigger trg_personalities_death_implies_not_living
  before insert or update of death_date, is_living on public.personalities
  for each row execute function public.personalities_death_implies_not_living();

update public.personalities
   set is_living = false, updated_at = now()
 where is_living is true and death_date is not null;

commit;
