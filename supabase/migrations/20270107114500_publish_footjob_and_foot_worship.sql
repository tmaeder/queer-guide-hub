-- Publish `footjob` and `foot-worship` — the human read has happened.
--
-- Both rows were deliberately created/rewritten UNPUBLISHED by 20261217100000
-- and 20261219100000: seo_indexable=false, human_reviewed=false,
-- verification_status='unverified'. That is the posture this programme uses for
-- machine-written prose, and it is not a formality — it has retracted prose from
-- production twice, and the lesson both times was that a presence check is not a
-- sense check. Only a person reading the text can clear it, which is why neither
-- migration cleared its own.
--
-- The owner has now read them and asked for both to be published.
--
-- WHAT "PUBLISH" MEANS HERE IS TWO DIFFERENT GATES, and they are easy to
-- conflate:
--
--   verification_status  governs the ANON READ. The RLS policy
--                        `unified_tags_public_gated_read` admits anon only when
--                        NOT tag_is_anon_gated(is_sensitive, verification_status)
--                        — i.e. non-sensitive OR verification_status in
--                        ('reviewed','locked'). Both rows are is_sensitive, so
--                        until now a signed-out visitor got a sign-in gate
--                        (20261220113000; before that, a hard 404).
--   seo_indexable        governs the CRAWLER.
--
-- Setting only the first would leave two pages readable by humans and invisible
-- to search; setting only the second would tell crawlers to index a page anon
-- cannot fetch. Both move together.
--
-- `human_reviewed` is set too, and it is not decoration: log_unified_tag_change()
-- RAISEs when an actor matching 'system:%' modifies a human_reviewed row, so it
-- is what stops the nightly sweeps rewriting prose a person has approved. It is
-- the same flag `foot-fetish` carries.
--
-- is_adult and is_sensitive are DELIBERATELY UNCHANGED. Publishing is not
-- declassifying: both terms are adult sexual vocabulary, they keep their flags,
-- and the age gate and Safe Mode filters keep applying. The target state is
-- exactly what the sibling `foot-fetish` already has —
-- adult=true sensitive=true indexable=true reviewed=true vstatus='reviewed'.
--
-- THE PROSE IS PINNED BY FINGERPRINT. The assertions below require the exact
-- authored text to still be in place. Between the review and this migration a
-- sweep could have rewritten either row (tag-enrichment-sweep writes prose, and
-- these rows are not yet human_reviewed so nothing stops it), and publishing
-- blind would then publish text nobody read — the precise failure this whole
-- posture exists to prevent. If the text has moved, this aborts and the review
-- has to happen again.

do $mig$
declare
  v_bad int;
begin
  perform set_config('app.actor', 'migration:publish-foot-cluster-prose', true);

  ---------------------------------------------------------------- preconditions
  -- Both rows exist, are live, and are still in the unpublished posture. If
  -- something already published them, this is not the migration that did it and
  -- it should not silently re-assert.
  select count(*) into v_bad
    from (values ('footjob'), ('foot-worship')) as s(slug)
   where not exists (
     select 1 from public.unified_tags t
      where t.slug = s.slug and t.status = 'active'
        and t.verification_status = 'unverified'
        and not t.seo_indexable
        and not coalesce(t.human_reviewed, false));
  if v_bad > 0 then
    raise exception
      'publish foot prose: % of 2 row(s) are not in the expected unpublished state — re-read before publishing', v_bad;
  end if;

  -- The text being published must be the text that was read. Pinned on a
  -- distinctive phrase from each authored body rather than a full-string
  -- compare, so ordinary punctuation edits do not abort, while a rewrite does.
  if not exists (
    select 1 from public.unified_tags
     where slug = 'footjob'
       and description = 'A non-penetrative sex act in which the feet are used to stimulate a partner''s genitals.'
       and long_description like '%among the lower-risk activities for transmitting sexually transmitted infections%'
  ) then
    raise exception 'publish foot prose: footjob prose is not the reviewed text — re-review before publishing';
  end if;

  if not exists (
    select 1 from public.unified_tags
     where slug = 'foot-worship'
       and description = 'The practice of adoring, attending to or serving a partner''s feet.'
       and long_description like '%a practice rather than an attraction%'
  ) then
    raise exception 'publish foot prose: foot-worship prose is not the reviewed text — re-review before publishing';
  end if;

  ------------------------------------------------------------------- publish
  update public.unified_tags
     set human_reviewed      = true,
         verification_status = 'reviewed',
         seo_indexable       = true
   where slug in ('footjob', 'foot-worship');

  ------------------------------------------------------------------ assertions
  -- Both gates open, asserted through the SAME predicate the RLS policy uses
  -- rather than by restating its logic — a restatement can drift from the policy
  -- and then assert nothing.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('footjob', 'foot-worship')
     and (public.tag_is_anon_gated(is_sensitive, verification_status) or not seo_indexable);
  if v_bad > 0 then
    raise exception 'publish foot prose: % row(s) are still gated from anon or still noindex', v_bad;
  end if;

  -- Published, not declassified: the adult/sensitive flags must survive, or the
  -- age gate and Safe Mode stop applying to two explicit sexual terms.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('footjob', 'foot-worship')
     and not (is_adult and is_sensitive);
  if v_bad > 0 then
    raise exception 'publish foot prose: % row(s) lost is_adult/is_sensitive — publishing must not declassify', v_bad;
  end if;

  -- Protected from the sweeps that would otherwise overwrite approved prose.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('footjob', 'foot-worship') and not coalesce(human_reviewed, false);
  if v_bad > 0 then
    raise exception 'publish foot prose: % row(s) are not marked human_reviewed', v_bad;
  end if;

  -- Scope: exactly two rows leave the gated cohort. The other ~100 sensitive
  -- unverified tags are a separate decision and must not ride along.
  if exists (
    select 1 from public.unified_tags
     where status = 'active' and seo_indexable
       and coalesce(nullif(btrim(description), ''), short_description) is null
  ) then
    raise exception 'publish foot prose: an indexable row corpus-wide has no description';
  end if;

  raise notice 'publish foot prose: footjob and foot-worship are anon-readable and indexable';
end
$mig$;
