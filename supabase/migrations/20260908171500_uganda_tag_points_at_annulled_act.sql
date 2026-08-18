-- `uganda-anti-homosexuality-act` described a law that was struck down, while
-- the law it is actually used for is in force and carries the death penalty.
--
-- THE ERROR POINTED THE DANGEROUS WAY, which is why this is worth a migration
-- rather than a backlog note. The tag is on 1,981 records. Its entire prose —
-- both `description` and `long_description` — was about the Anti-Homosexuality
-- Act, 2014, and ended on "the Constitutional Court of Uganda ruled the act
-- invalid on procedural grounds." Its `wikidata_id` was Q7877583, which is that
-- 2014 Act. A reader arriving from any of those 1,981 records saw a page whose
-- only prose says Uganda's anti-homosexuality law was invalidated.
--
-- It was not. The Anti-Homosexuality Act, 2023 (Act 6 of 2023) is in force.
--
-- MEASURED, NOT ASSUMED. Of the tagged news with a publication date, 1,904 are
-- from 2026 and 8 from 2025 — none from 2013 or 2014. Not one record on this tag
-- is about the 2014 Act, so the tag means the 2023 Act in practice and the link
-- and prose were simply attached to the wrong instrument. Same class as the
-- hate-crimes/television-episode link repaired in 20260906100100, but more
-- consequential: this one understates criminal exposure in a country that
-- imposes the death penalty for "aggravated homosexuality".
--
-- Nothing here is a paraphrase of memory. Every asserted fact was read off a
-- fetched page: the Act's assent date and Act number from the Parliament of
-- Uganda's own published copy (already cited on this tag), and the penalties,
-- the April 2024 Constitutional Court outcome and the 2014 Act's 1 August 2014
-- invalidation for want of quorum from the two English Wikipedia articles for
-- the respective Acts.
--
-- DELIBERATELY NOT CLAIMED: any outcome of the Supreme Court appeal filed on
-- 11 July 2024. No source consulted states one, so the text says the appeal is
-- pending and the citation keeps `partially_invalidated` rather than resolving
-- the Act's status either way.
--
-- `verification_status` is 'auto' and `human_reviewed` is false on this row, so
-- no curated editorial work is being overwritten — the prose came from an
-- automated Wikipedia extract of the wrong article.

select set_config('app.actor', 'admin:uganda-tag-fix-20260908', true);

-- ── 1. Point the tag at the instrument it is actually about ────────────────
-- Q117265856 = Anti-Homosexuality Act, 2023. Resolved the same way as the
-- 20260906100100 repairs: by asking the English Wikipedia which item its
-- article is the sitelink for, not by label search.
update public.unified_tags
   set wikidata_id   = 'Q117265856',
       wikipedia_url = 'https://en.wikipedia.org/wiki/Anti-Homosexuality_Act,_2023'
 where slug = 'uganda-anti-homosexuality-act'
   and wikidata_id = 'Q7877583';

-- ── 2. Prose that leads with what is in force ─────────────────────────────
-- The death-penalty provision is stated plainly and early. This page is read by
-- people deciding whether it is safe to travel to or remain in Uganda, and a
-- description that opens on a 2014 annulment buries the only fact that matters
-- to that decision.
update public.unified_tags
   set description = 'The Anti-Homosexuality Act, 2023 (Act 6 of 2023) is Ugandan law, assented to by President Yoweri Museveni on 26 May 2023. It punishes "homosexuality" with life imprisonment, "aggravated homosexuality" with death, and the "promotion of homosexuality" with 20 years. In April 2024 the Constitutional Court of Uganda upheld most of the Act, striking only a small number of provisions; an appeal to the Supreme Court was filed on 11 July 2024 and no outcome has been recorded here. An earlier Anti-Homosexuality Act, 2014 was signed on 24 February 2014 and invalidated by the Constitutional Court on 1 August 2014 for want of quorum — that is a separate, superseded law.',
       long_description = NULL,
       verification_status = 'reviewed',
       last_verified_at = now()
 where slug = 'uganda-anti-homosexuality-act';

-- `long_description` is cleared rather than rewritten: it held the same
-- 2014-only text, and TagDetail renders it as the page body BELOW the lead. Two
-- descriptions of two different statutes on one page is how this became
-- confusing in the first place. The lead above is now the single account.

-- ── 3. Keep the 2014 Act as history, correctly labelled ───────────────────
-- It is a real instrument and a real part of this story, so it is recorded as a
-- source rather than deleted — but as `superseded`, which is exactly what the
-- status vocabulary exists to express. Without it, "an earlier Act was
-- invalidated" in the prose above would be an uncited claim.
insert into public.tag_sources
  (tag_id, source_type, source_url, official_title, jurisdiction,
   adopted_year, instrument_status, claim_summary, is_public, verified_at, fetched_at)
select t.id, 'statute',
       'https://en.wikipedia.org/wiki/Anti-Homosexuality_Act,_2014',
       'The Anti-Homosexuality Act, 2014', 'UG', 2014, 'superseded',
       'Signed 24 February 2014; invalidated by the Constitutional Court of Uganda on 1 August 2014 for want of quorum. Replaced in substance by the Act of 2023.',
       true, now(), now()
  from public.unified_tags t
 where t.slug = 'uganda-anti-homosexuality-act'
on conflict (tag_id, source_url) where is_public do update set
  official_title    = excluded.official_title,
  instrument_status = excluded.instrument_status,
  claim_summary     = excluded.claim_summary,
  verified_at       = now();

-- ── 4. Post-conditions ────────────────────────────────────────────────────
do $do$
declare v_desc text; v_qid text; v_sources int; v_inforce int;
begin
  select description, wikidata_id into v_desc, v_qid
    from public.unified_tags where slug = 'uganda-anti-homosexuality-act';

  if v_qid <> 'Q117265856' then
    raise exception 'tag still points at % instead of the 2023 Act', v_qid;
  end if;
  -- The specific regression being guarded: prose that says the law is gone.
  if v_desc !~ 'is Ugandan law' then
    raise exception 'description no longer states the Act is in force';
  end if;
  if v_desc !~ 'death' then
    raise exception 'description omits the death-penalty provision';
  end if;

  select count(*), count(*) filter (where instrument_status = 'partially_invalidated')
    into v_sources, v_inforce
    from public.tag_sources s join public.unified_tags t on t.id = s.tag_id
   where t.slug = 'uganda-anti-homosexuality-act' and s.is_public;
  if v_sources <> 2 then
    raise exception 'expected 2 public citations on the Uganda tag, found %', v_sources;
  end if;
  if v_inforce <> 1 then
    raise exception 'the 2023 Act is no longer marked partially_invalidated';
  end if;

  raise notice 'uganda tag repointed to the 2023 Act; % citations', v_sources;
end $do$;
