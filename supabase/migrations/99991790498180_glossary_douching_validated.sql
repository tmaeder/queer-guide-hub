-- `douching` and `douche`, re-checked against seven dedicated sources.
--
-- WHY THIS EXISTS: 99991790451897 rewrote `douching`'s body an hour earlier from
-- THREE fisting guides plus clinical knowledge, and recorded that none of those
-- six named a downside to pre-fisting douching — a unanimous-but-incomplete
-- consensus. Seven dedicated douching sources are the check on what that pass
-- published. The result is not a retraction: the two riskiest claims are
-- VALIDATED, one unreplicated mechanism I added is REMOVED, and three things the
-- sources are near-unanimous about were MISSING.
--
-- SOURCES (7 requested, 6 READ): healthline.com, centraloutreach.com (LGBTQ+
-- health clinic), endinghiv.org.au (ACON, Australian HIV org),
-- cheekycharity.org (bowel-health charity), burnettfoundation.org.nz (NZ HIV
-- org), webmd.com. **masterclass.com is UNREAD** — 403 direct, 403 via
-- r.jina.ai, and the Wayback fallback also refused. It is excluded from every
-- tally and NO position is attributed to it. Unread is not silent, and the
-- denominator below is 6, not 7. It also carries no clinical credential, so its
-- absence does not weaken the picture — but nobody looked inside, and that is
-- recorded rather than rounded away.
--
-- WEIGHTING: four of the six read carry public-health weight (two national HIV
-- organisations, one LGBTQ+ clinic, one bowel-health charity) and two are
-- consumer health media. **Sources 3 and 6 are very likely ONE voice, not two** —
-- endinghiv and Burnett pair "lukewarm water only" with "soap damages the
-- sensitive lining" in the same clause order with the same qualifier, they are
-- neighbouring national HIV orgs with a history of shared campaign material, and
-- their claim sets overlap almost completely. So every tally that leans on both
-- is really one lineage, and what makes the two findings below robust rather
-- than an echo is that the two consumer-media sources support them INDEPENDENTLY
-- of the HIV sector.
--
-- ── WHAT WAS VALIDATED (kept unchanged in substance) ─────────────────────────
--   * Douching strips or damages the mucosal barrier: **6 of 6, zero
--     contradiction**, across both weight tiers and both lineages. The single
--     most robust claim in the set.
--   * It RAISES HIV and STI risk rather than merely failing to protect: **5 of
--     6 support, ZERO contradict, 1 silent.** The silence is the LGBTQ+ clinic
--     declining to close the causal step to transmission — an omission by a
--     clinical provider, not a source disputing the mechanism.
--   * No soap and no household additives: 5 of 6, zero contradiction.
--
-- ── WHAT WAS WRONG AND IS REMOVED ────────────────────────────────────────────
-- The previous body said irritated tissue "tears more easily and ABSORBS MORE".
-- The tearing half is what the sources give; **"absorbs more" is a mechanism NO
-- source in the set states.** It is plausible and it was mine, which is exactly
-- the kind of addition that should not survive a check. The sentence now carries
-- only the mechanism the sources actually provide — tears and abrasions.
--
-- ── WHAT WAS MISSING AND IS ADDED ────────────────────────────────────────────
--   * **A timing gap before sex: 6 of 6 give one**, ranging 30 minutes to two
--     hours, and endinghiv warns explicitly against douching immediately before.
--     The previous body said nothing about timing at all. Published as the range
--     the sources span rather than by picking one number.
--   * **A frequency ceiling: 5 of 6, and the two numeric ones agree EXACTLY** —
--     healthline and webmd both give no more than once a day and two to three
--     times a week, with Burnett matching the weekly half. Two independent
--     sources agreeing to the number is the strongest corroboration in the set,
--     so it is the one figure published.
--   * **A stopping rule for water that will not run clear.** endinghiv is the
--     only source that treats this as a reason to stop rather than a volume
--     problem, and it is the single most actionable instruction in the set. One
--     source, but it resolves a contest the others leave open: 5 of 6 say repeat
--     until clear and 4 of 6 simultaneously cap it, so "chase clear" without a
--     brake is a real failure mode that only this rule closes.
--   * Flora as a SECOND mechanism distinct from barrier damage (3 of 6), and
--     diet reducing the need to douche at all (3 of 6).
--
-- ── DELIBERATELY NOT PUBLISHED, each measured ────────────────────────────────
--   * **The 74% higher-STD-odds figure** (webmd only). The only number in the
--     set, therefore uncheckable here, and the magnitude of the increase is
--     actively CONTESTED — cheekycharity says "slightly", healthline hedges with
--     "potentially", endinghiv and webmd state it flat. Same direction,
--     materially different strength; publishing one number would flatten a real
--     disagreement.
--   * **Saline in preference to plain tap water** (webmd, with healthline
--     straddling). This is the one place a source contradicts the plain-water
--     advice, on electrolyte grounds and only for FREQUENT use. All four
--     public-health sources say plain water, and the frequency ceiling now in
--     the body bounds the case the objection is about, so plain water stays.
--   * **A single temperature number.** Contested three ways: healthline says
--     COOLER than lukewarm, cheekycharity pins body temperature at 37 °C, and
--     the rest say lukewarm with no figure. Those are not reconcilable by
--     averaging, so the body keeps the unnumbered word all four public-health
--     sources use and adds the burn risk (2 of 6) as the reason.
--   * The ~10-flush session cap (one source), laxatives and bisacodyl (one),
--     rebound constipation (one), the specific STI enumeration (one), and
--     webmd's unreplicated anatomical argument that stool normally sits too high
--     in the colon to matter for anal sex — the strongest version of "you may
--     not need this at all", and single-source.
--
-- ── ALSO FIXED: a residue the fisting pass left ──────────────────────────────
-- That pass repaired `douche`'s SUMMARY and explicitly left its body, on the
-- ground that the body already carried the correct do-not-share rule. It does —
-- and it also still opens "It typically refers to vaginal irrigation", which is
-- the same narrowing defect one field over, on a platform where the anal case is
-- the overwhelmingly common one. Fixing the summary and leaving the body is the
-- half-repair this repo keeps recording; the rule is to read all three prose
-- fields when one of them is wrong.
--
-- Guarded by src/lib/__tests__/glossaryDouchingValidated.test.ts.

select set_config('app.actor', 'migration:99991790498180_glossary_douching_validated', true);

-- Attribution only on these two: `douching` is human_reviewed = false and
-- `douche` is true, so the declaration is load-bearing for `douche` alone.
-- Verified live with a REAL value change, since a self-assignment fires no
-- trigger and reads exactly like a permissive one.

create temporary table _dv_before on commit drop as
select slug, description, short_description, long_description
from unified_tags
where slug in ('douching','douche','anal-fisting','fisting','scat-play','lubricant');

-- ── `douching`: keep what six sources validate, drop what none of them says ──
-- Guarded on the previous pass's own output, so a concurrent better fix is not
-- overwritten. `description` and `short_description` are NOT touched: both are
-- correct and the summary already carries the useful-and-easy-to-overdo framing.
update unified_tags set long_description =
  'Douching means rinsing a body cavity out, and on this platform that usually means the rectum before anal sex or fisting. Plain lukewarm water and a small bulb is the whole method: no soap and no additives, no great volume, and water that is merely warm rather than hot, since hot water scalds a lining that is thinner than it feels. Two or three flushes is normally enough, and if the water will not run clear, that is a reason to stop and do something else rather than to keep going. The restraint is the point, because the thing being rinsed away is also a protective layer: douching strips mucus, irritates the lining and disturbs the bacteria living on it, and an irritated lining tears more easily — which is why douching raises rather than lowers the risk of the infections people douche to feel clean about. Leave half an hour to a couple of hours before sex rather than going straight from one to the other, keep it to once in a day and two or three times a week at most, and know that eating enough fibre reduces how often it feels necessary at all. Frequent vaginal douching is worse again, disrupting the bacterial balance and making bacterial vaginosis and thrush more likely, which is why clinicians advise against it there rather than merely cautioning about technique. A bulb is never shared between cavities or between people.'
where slug = 'douching' and status = 'active'
  and long_description like '%absorbs more%';

-- ── `douche`: the body half of the narrowing the last pass only half-fixed ───
-- The do-not-share rule is the one thing worth keeping from the old body and it
-- is kept. What goes is the vaginal-first framing and the flat assertion that
-- this is "not a recreational product", which is not this platform's call to
-- make about its own readers.
update unified_tags set long_description =
  'A douche is the device rather than the practice: a squeeze bulb, a bag, or an attachment that screws onto a shower hose in place of the head. The bulb is what most people use and the easiest to control, because the amount of water and the pressure are both limited by the hand holding it; a shower attachment delivers far more of both, which is why it is the harder one to use gently. Whatever the type, the nozzle wants lubricant and the water wants to be merely warm. One bulb is never shared between people, and never moved between the rectum and the vagina, since that carries bacteria from one to the other.'
where slug = 'douche' and status = 'active'
  and long_description like '%typically refers to vaginal irrigation%';

do $verify$
declare
  v_scope     int;
  v_absorbs   int;
  v_validated int;
  v_added     int;
  v_refused   int;
  v_vaginal   int;
  v_share     int;
  v_thin      int;
  v_intact    int;
  v_collat    int;
begin
  -- Soft on preconditions.
  select count(*) into v_scope from unified_tags
   where status = 'active' and slug in ('douching','douche');
  if v_scope < 2 then
    raise exception 'douching pass: only % of 2 rows still active - refusing to report success on a corpus that moved out from under the file', v_scope;
  end if;

  -- 1. The unreplicated mechanism is gone. No source in the set says a douched
  --    lining absorbs more; the tearing half is what they give.
  select count(*) into v_absorbs from unified_tags
   where slug = 'douching' and status = 'active' and long_description like '%absorbs more%';
  if v_absorbs <> 0 then
    raise exception 'douching pass: the unreplicated absorption mechanism is still published';
  end if;

  -- 2. The two VALIDATED claims survive. Stated positively and per claim, not as
  --    a count over an OR — that counts rows, and both live on one row here.
  select count(*) filter (where long_description like '%strips mucus%')
       + count(*) filter (where long_description like '%raises rather than lowers the risk%')
       + count(*) filter (where long_description like '%tears more easily%')
    into v_validated
    from unified_tags where slug = 'douching' and status = 'active';
  if v_validated <> 3 then
    raise exception 'douching pass: only % of 3 validated claims survive on douching', v_validated;
  end if;

  -- 3. The three MISSING things are now present: a timing gap, a frequency
  --    ceiling, and a stopping rule for water that will not run clear.
  select count(*) filter (where long_description like '%half an hour to a couple of hours%')
       + count(*) filter (where long_description like '%once in a day and two or three times a week%')
       + count(*) filter (where long_description like '%will not run clear%')
       + count(*) filter (where long_description like '%fibre%')
    into v_added
    from unified_tags where slug = 'douching' and status = 'active';
  if v_added <> 4 then
    raise exception 'douching pass: only % of 4 added instructions are present', v_added;
  end if;

  -- 4. THE REFUSALS, MADE ENFORCEABLE. Each of these would mean the file had
  --    adopted a contested or single-source claim as settled.
  select count(*) filter (where long_description like '%74%')
       + count(*) filter (where long_description ~* 'saline')
       + count(*) filter (where long_description ~* '37 ?°?C|body temperature')
       + count(*) filter (where long_description ~* 'bisacodyl|laxative')
       + count(*) filter (where long_description ~* 'too high in the colon')
    into v_refused
    from unified_tags where slug = 'douching' and status = 'active';
  if v_refused <> 0 then
    raise exception 'douching pass: % contested or single-source claim(s) were published', v_refused;
  end if;

  -- 5. `douche` no longer leads with vaginal irrigation, and KEEPS the
  --    do-not-share rule that was the reason its body was spared last time.
  select count(*) into v_vaginal from unified_tags
   where slug = 'douche' and status = 'active'
     and long_description like '%typically refers to vaginal irrigation%';
  if v_vaginal <> 0 then
    raise exception 'douche still leads its body with vaginal irrigation';
  end if;

  select count(*) into v_share from unified_tags
   where slug = 'douche' and status = 'active'
     and long_description like '%never shared between people%'
     and long_description like '%never moved between the rectum and the vagina%';
  if v_share <> 1 then
    raise exception 'douche lost the do-not-share rule';
  end if;

  -- 6. Nothing became unpublishable. CALL the real predicate.
  select count(*) into v_thin from unified_tags
   where status = 'active' and slug in ('douching','douche')
     and not tag_has_prose(description, short_description);
  if v_thin <> 0 then
    raise exception 'douching pass: % row(s) fail tag_has_prose', v_thin;
  end if;

  -- 7. The sibling bodies this pass does not touch are intact — three prose
  --    writes is still enough to take a good body with them.
  select count(*) filter (where slug = 'fisting'      and long_description like '%hepatitis C%')
       + count(*) filter (where slug = 'anal-fisting' and long_description like '%perforation of the rectal wall%')
       + count(*) filter (where slug = 'scat-play'    and long_description like '%faecal-oral route%')
       + count(*) filter (where slug = 'lubricant'    and description      like '%oil-based lube destroys latex condoms%')
    into v_intact
    from unified_tags
   where status = 'active' and slug in ('fisting','anal-fisting','scat-play','lubricant');
  if v_intact <> 4 then
    raise exception 'douching pass: only % of 4 untouched sibling claims survive', v_intact;
  end if;

  -- 8. PROVE the scope: this pass writes long_description on two rows and
  --    nothing else anywhere.
  select count(*) into v_collat
    from _dv_before b join unified_tags t on t.slug = b.slug
   where t.description       is distinct from b.description
      or t.short_description is distinct from b.short_description
      or (t.long_description is distinct from b.long_description
            and b.slug not in ('douching','douche'));
  if v_collat <> 0 then
    raise exception 'douching pass: % row(s) had a column move that this file does not write', v_collat;
  end if;

  raise notice 'douching pass OK: scope %, absorbs 0, validated 3, added 4, refused 0, vaginal-first 0, share-rule 1, siblings 4, collateral 0',
    v_scope;
end
$verify$;
