-- Sentinel for the glossary structural standard
--
-- A standard that is only prose is a standard nobody re-checks. This makes
-- conformance a number that moves, on the same discipline as
-- styleguide_content_drift(): report the PROBE separately from the counts,
-- hard-fail on a broken probe, and be advisory on a backlog that can only be
-- worked down by hand.
--
-- STANDALONE, not a new key on tag_hygiene_stats(). That body is ~210 lines and
-- restating it to add a counter is a merge-collision surface -- the reason
-- glossary_link_signals, tag_disowned_prose_signals and tag_merge_graph_signals
-- are all separate functions. It is also service_role only from the start: a
-- DEFINER aggregate granted to `authenticated` is granted to every member.
--
-- `rows_scanned` is reported FIRST and deliberately, because four zeroes from an
-- empty scan and four zeroes from a clean corpus are the same reassuring
-- reading, and this corpus is neither.
--
-- WHAT EACH KEY IS, and why none of them is a zero-invariant:
--
--   truncated_description  -- 23 at baseline. Sits on a length cap, ends
--                             mid-clause. Cannot be repaired without
--                             regenerating content, so gating at zero ships red
--                             on arrival and gets scrolled past -- the cry-wolf
--                             shape already removed once from the dedup backlog
--                             rule. GROWTH is the signal: a new one means a
--                             producer is still writing into a cap.
--   stamp_as_definition    -- a scrape timestamp published as a definition.
--                             Driven to 0 by 99200101100200 and gates there,
--                             because a stamp reads as content and defeats both
--                             indexable_without_description and the thin-page
--                             deindexer, while a blank is honest and self-heals.
--   unresolved_disambiguation -- "X may refer to:" lists. 2 at baseline, both
--                             already recorded as unrepairable-under-the-rule
--                             (CLAUDE.md names bicon explicitly). Advisory.
--   whitespace_dirty       -- leading/trailing whitespace or internal double
--                             spaces. Deterministically repairable, so this one
--                             IS a zero-invariant after 99200101100200.
--
-- NOT COUNTED, on purpose: register conformance. Telling a noun phrase from a
-- sentence is grammar, not a regex -- the <60 band holds both "Cute animal role"
-- and "A man who was assigned female at birth." -- and a counter that guessed
-- would hand a reviewer a list that is mostly correct rows, which is how a queue
-- teaches people to rubber-stamp.

begin;

create or replace function public.tag_prose_standard_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v jsonb;
begin
  with a as (
    select description as d
    from unified_tags
    where status = 'active'
      and description is not null
      and btrim(description, E' \t\n\r') <> ''
  )
  select jsonb_build_object(
    'probe_ok', true,
    'rows_scanned', count(*),
    -- a cap-length row that stops without a terminal mark has lost text
    'truncated_description', count(*) filter (
      where length(d) in (500, 1000, 2000)
        and d !~ '[.!?]["'')\]]?\s*$'),
    'stamp_as_definition', count(*) filter (
      where d ~* '^(updated )?[a-z]+ +[0-9]{1,2}, *[0-9]{4}'),
    -- ANCHORED, and the anchor is load-bearing: a bare "(may|could) refer to"
    -- also matches pansexuality's perfectly correct "Pansexual people may refer
    -- to themselves as gender-blind". A disambiguation list names itself at the
    -- start and opens a colon; ordinary prose does neither.
    'unresolved_disambiguation', count(*) filter (
      where d ~* '^[^.!?]{0,60}(may|could) refer to\s*:'),
    'whitespace_dirty', count(*) filter (
      where d <> btrim(d, E' \t\n\r') or d ~ '[ \t]{2,}')
  )
  into v
  from a;

  return v;
exception when others then
  -- a probe that cannot run must SAY so rather than fall through to zeros
  return jsonb_build_object('probe_ok', false, 'error', sqlerrm);
end
$$;

comment on function public.tag_prose_standard_signals() is
  'Conformance of active glossary descriptions to the structural standard '
  '(styleguide rules tag-field-contract / tag-two-registers / '
  'tag-never-punctuate-a-truncation / tag-description-is-evidence). '
  'whitespace_dirty and stamp_as_definition are zero-invariants; '
  'truncated_description and unresolved_disambiguation are advisory and gate on GROWTH.';

revoke all on function public.tag_prose_standard_signals() from public;
revoke all on function public.tag_prose_standard_signals() from anon;
revoke all on function public.tag_prose_standard_signals() from authenticated;
grant execute on function public.tag_prose_standard_signals() to service_role;

do $verify$
declare
  v jsonb;
  v_bad int;
begin
  v := public.tag_prose_standard_signals();

  if coalesce((v->>'probe_ok')::boolean, false) is not true then
    raise exception 'tag_prose_standard_signals: probe failed: %', v->>'error';
  end if;

  -- a probe that scans nothing reports the same zeros as a clean corpus
  if coalesce((v->>'rows_scanned')::int, 0) < 1000 then
    raise exception 'tag_prose_standard_signals: scanned only % rows, probe is not measuring the corpus',
      v->>'rows_scanned';
  end if;

  -- every documented key is present. An absent key reads as a clean count.
  select count(*) into v_bad
  from unnest(array['rows_scanned','truncated_description','stamp_as_definition',
                    'unresolved_disambiguation','whitespace_dirty']) as k
  where not (v ? k);
  if v_bad <> 0 then
    raise exception 'tag_prose_standard_signals: % documented key(s) missing from the probe', v_bad;
  end if;

  -- POSITIVE CONTROL: the truncation counter must be finding the class this
  -- function exists for. Zero here would mean the regex stopped matching, which
  -- is indistinguishable from a repaired corpus -- and nothing repairs these.
  if coalesce((v->>'truncated_description')::int, 0) = 0 then
    raise exception 'tag_prose_standard_signals: truncation counter found 0, expected the known cap-length cohort';
  end if;

  -- and the anchored disambiguation regex must still match the known pair while
  -- NOT matching pansexuality, whose prose legitimately contains "may refer to"
  if coalesce((v->>'unresolved_disambiguation')::int, -1) <> 2 then
    raise exception 'tag_prose_standard_signals: disambiguation counter read %, expected the known pair (bicon, flamer)',
      v->>'unresolved_disambiguation';
  end if;

  -- service_role only
  if has_function_privilege('authenticated', 'public.tag_prose_standard_signals()', 'execute') then
    raise exception 'tag_prose_standard_signals: must not be executable by authenticated';
  end if;
end
$verify$;

commit;
