-- Normalize events.age_restriction and events.recurrence_pattern onto controlled values.
--
-- Both are exact-match filters, not just display strings:
--   src/hooks/useEvents.tsx:213  ->  query.eq('age_restriction', filters.ageRestriction)
-- so a free-text value like '18+ or accompanied by an adult' is unreachable by any filter,
-- and 60 distinct spellings of ~7 real concepts make the facet meaningless.
--
-- The canonical option list already exists in the product: CreateGroupEventDialog.tsx
-- offers '', '18+', '21+', 'all-ages'. The scraped corpus ignored it. This widens that
-- set to the shape `<n>+` plus 'all-ages' (the data legitimately contains 13+ .. 40+)
-- and maps the 60 observed spellings onto it.
--
-- Raw text is preserved in enrichment_status.age_restriction_raw -- nothing is destroyed,
-- and a compound string that cannot be represented ('18+ for some events, 21+ for others')
-- becomes NULL rather than a confidently wrong single value.

create or replace function public.normalize_age_restriction(p_raw text)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v text := lower(btrim(coalesce(p_raw, '')));
  v_n integer;
begin
  -- Empty / explicit absence. 'null' is a literal string the scraper wrote 41 times.
  if v = '' or v in ('null', 'none', 'none stated', 'none mentioned', 'n/a', 'unknown') then
    return null;
  end if;

  -- Compound or conditional statements carry two different limits, or none at all.
  -- Representing them as a single value would be a guess, so drop to null and keep raw.
  if v like '%varies%'
     or v ~ '\d+\+.*(for (some|others)|,\s*\d+\+)'
     or v like '%for some events%'
     or v like '%none mentioned, but%'
     or v like '%none stated, but%'
     or v like '%implied%' then
    return null;
  end if;

  -- "all ages welcome, under 18 must be accompanied" IS all-ages: a supervision caveat
  -- is not an age restriction. Check this before the numeric extraction below, which
  -- would otherwise latch onto the 18 and lock children out of a family event.
  if v like '%all age%' or v like '%no age limit%' or v like '%family friendly%'
     or v like '%all-ages%' then
    return 'all-ages';
  end if;

  -- A bare supervision caveat with no stated minimum is also all-ages. But it must NOT
  -- override an explicit minimum: "16+ (under 18s must be accompanied by an adult over 21)"
  -- is a 16+ event whose caveat covers 16-18 year olds -- reading it as all-ages would
  -- tell a parent a 10-year-old may attend.
  if (v ~ 'under[- ]?\d+.*(accompan|supervis)'
      or v ~ '\d+\s*(year olds?|yr olds?)?\s*(need|must have) supervision')
     and v !~ '\d+\s*\+' and v !~ 'over\s*\d+' then
    return 'all-ages';
  end if;

  if v like '%adults-only%' or v like '%adult only%' or v like '%adults only%' then
    return '18+';
  end if;

  -- Extract the first age mentioned. Covers '18+', '+16', '18', 'over 18', 'over 18s only',
  -- '18 and over', '21 and up', '16 plus', '15yrs old', '18 yrs +', '13-18', '30s+'.
  v_n := (regexp_match(v, '(\d{1,2})'))[1]::integer;

  if v_n is null or v_n < 5 or v_n > 99 then
    return null;
  end if;

  return v_n::text || '+';
end;
$$;

comment on function public.normalize_age_restriction(text) is
  'Maps free-text age restrictions onto the controlled shape <n>+ or all-ages, or NULL when the source states two different limits. Supervision caveats ("under 18s must be accompanied") resolve to all-ages, never to a numeric minimum.';

-- Apply. Small enough (~331 rows) to run in one statement without tripping the
-- search-sync trigger budget -- only 3 of these events are indexable.
update public.events e
set age_restriction = public.normalize_age_restriction(e.age_restriction),
    enrichment_status = jsonb_set(
      coalesce(e.enrichment_status, '{}'::jsonb), '{age_restriction_raw}',
      to_jsonb(e.age_restriction), true)
where e.age_restriction is not null
  and e.age_restriction is distinct from public.normalize_age_restriction(e.age_restriction);

-- recurrence_pattern: 'annual' (1071) and 'yearly' (10) are the same concept.
-- The machine-readable form lives in recurrence_rule jsonb; this column is the
-- human-readable rendering produced by describeRecurrence() in src/lib/recurrence.ts.
update public.events
set recurrence_pattern = 'annual'
where lower(btrim(recurrence_pattern)) = 'yearly';
