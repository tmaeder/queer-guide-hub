-- Retract the false has_mismatch verdicts in geo_validations.
--
-- pipeline-geo-validate compared a stored ISO-2 code against Nominatim's
-- English country name, so 'US' vs 'United States' disagreed on every row it
-- touched. Measured 2026-09-04: 692 of 985 rows carried has_mismatch.
-- Recomputing each verdict with both sides canonicalised through `countries`
-- leaves 41 — the signal ran at roughly 6% precision.
--
-- THE 41 ARE REAL AND MUST SURVIVE. A-House is filed in Eastham,
-- Massachusetts and reverse-geocodes to Hobart, Australia; Nice Boys is filed
-- in Nice and lands in Philadelphia; Jinya is filed in Tokyo and lands in the
-- United States. Several are among the 670 venues already known to sit >500 km
-- from their linked city. The queue was unreadable, not empty, so this
-- migration cleans it rather than clearing it.
--
-- Retraction is by RE-DERIVATION, not by pattern-matching mismatch_details.
-- Every one of the 692 messages has the shape
--   Stored country '<ISO2>' ≠ geocoded '<English name>'
-- including all 41 true positives, so a regex over that text matches the real
-- findings and the artifacts equally. (That exact mistake was made while
-- investigating this defect and briefly produced the conclusion "it never
-- found anything real".) The join below compares canonical country values,
-- which is the thing itself rather than a proxy for it.
--
-- Rows are UPDATEd, never deleted: geocoded_address / country / city are a
-- real reverse-geocode result and stay useful. Only the verdict was wrong.
-- last_validated_at is deliberately left alone — the geocode is still valid,
-- and bumping it would push every row past the function's 30-day skip window
-- and re-spend the Nominatim budget re-deriving what we already have.
--
-- KNOWN, ACCEPTED: dependent territories and SARs stay flagged (6 Hong Kong
-- venues filed 'HK' geocoding to China, 1 Puerto Rico venue filed 'PR'
-- geocoding to the United States). `countries` has no sovereign/parent column,
-- so the rule cannot express them. They are resolved by
-- geo_boundaries.sovereign_iso_a2 in the containment validator.

do $retract$
declare
  v_before_flagged bigint;
  v_after_flagged  bigint;
  v_retracted      bigint;
  v_promoted       bigint;
begin
  select count(*) filter (where has_mismatch) into v_before_flagged
  from public.geo_validations where content_type = 'venue';

  with canon as (
    select lower(name) as k, name as canonical from public.countries where name is not null
    union all
    select lower(code), name from public.countries where code is not null and name is not null
  ),
  recomputed as (
    select gv.id,
           gv.has_mismatch                             as old_verdict,
           cs.canonical                                as canon_stored,
           cg.canonical                                as canon_geocoded,
           -- Identical rule to countriesDisagree() in _shared/geo-normalize.ts:
           -- both sides must be recognised before a difference counts. An
           -- unrecognised spelling is "no opinion", never a finding.
           (cs.canonical is not null
            and cg.canonical is not null
            and cs.canonical <> cg.canonical)          as new_verdict
    from public.geo_validations gv
    join public.venues v on v.id = gv.content_id
    left join canon cs on cs.k = lower(btrim(v.country))
    left join canon cg on cg.k = lower(btrim(gv.country))
    where gv.content_type = 'venue'
  ),
  applied as (
    update public.geo_validations gv
       set has_mismatch = r.new_verdict,
           confidence   = case when r.new_verdict then 0.4 else 0.9 end,
           mismatch_details = case
             when r.new_verdict then
               'Coordinate resolves to ' || r.canon_geocoded ||
               ' but venue is filed under ' || r.canon_stored
             else null
           end
      from recomputed r
     where gv.id = r.id
       and gv.has_mismatch is distinct from r.new_verdict
    returning r.old_verdict, r.new_verdict
  )
  select count(*) filter (where old_verdict and not new_verdict),
         count(*) filter (where not old_verdict and new_verdict)
    into v_retracted, v_promoted
  from applied;

  select count(*) filter (where has_mismatch) into v_after_flagged
  from public.geo_validations where content_type = 'venue';

  -- Assert the shape of the result rather than an exact count. Exact counts
  -- rot: the nightly cron keeps writing rows, and this migration may not apply
  -- on the same day it was authored. What must hold is that a large artifact
  -- was removed AND that real findings were not swept away with it.
  if v_retracted = 0 then
    raise exception
      'retraction removed nothing (before=%, after=%) — the recompute did not match the stored verdicts',
      v_before_flagged, v_after_flagged;
  end if;

  if v_after_flagged = 0 then
    raise exception
      'retraction cleared EVERY mismatch (before=%) — the 41 genuine findings must survive; the canon join is over-matching',
      v_before_flagged;
  end if;

  if v_after_flagged >= v_before_flagged then
    raise exception
      'retraction did not reduce the flagged set (before=%, after=%)',
      v_before_flagged, v_after_flagged;
  end if;

  raise notice
    'geo_validations verdicts recomputed: flagged % -> %, retracted %, promoted %',
    v_before_flagged, v_after_flagged, v_retracted, v_promoted;
end
$retract$;
