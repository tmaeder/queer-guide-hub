-- Glossary pass: fisting, compared against six external guides.
--
-- SOURCES (6 requested, 6 read, none needed a fallback): thepleasurechest.com,
-- sinful.co.uk, sfaf.org (San Francisco AIDS Foundation), bespokesurgical.com
-- (colorectal surgical practice), badgirlsbible.com, thecode.shop. Licence
-- stance is the Kinktionary's: the TERM LIST was used as a signal for what is
-- absent; no wording was copied or paraphrased. 118 distinct terms extracted.
--
-- THE SOURCE WEIGHTING IS NOT THE COUNT, AND FOUR CAVEATS CHANGED THE OUTCOME.
--   (a) Sources 1, 2 and 6 are all adult-retail marketing. No textual
--       derivation, but ONE commercial stance: their shared terms cluster on
--       purchasable goods (gloves, lube grades, plugs, balm) and their shared
--       "safe with proper preparation" framing is commercially interested. A
--       term named only by that trio has a count of 3 and one point of view.
--   (b) Only sources 3 and 4 carry clinical weight, and they cover DISJOINT
--       ground — SFAF on infection and transmission, Bespoke on anatomy and
--       injury. Neither corroborates the other, so most clinical terms here sit
--       at count 1 behind a single credible source.
--   (c) Source 4 sells the procedures it names. Anal botox, anal manometry, the
--       Emsella chair, anal-elasticity services and laser hair removal are that
--       practice's own commercial offerings; a surgical credential does not make
--       them consensus vocabulary. It is the retail-blog problem in a clinic's coat.
--   (d) Source 5 is the alarmist pole (injury, prolapse, perforated colon,
--       fatal infection) against source 2's reassuring pole. Neither is quoted.
--
-- EIGHT CLAIMS ARE CONTESTED OR UNREPLICATED AND NONE IS PUBLISHED AS SETTLED.
-- Whether fisting is safe or dangerous (2 vs 5, opposite poles); what pain MEANS
-- (three incompatible models across 2, 4 and 6); numbing agents versus
-- pharmacological relaxation (5 forbids the first, 4 sells the second); whether
-- regular fisting weakens anal tone (source 4 alone, and it sells the
-- restoration); the magnitude of HIV risk (SFAF alone); douching (unanimous
-- across 2, 3 and 4 and NONE of the six names a downside — a
-- unanimous-but-incomplete consensus, the more dangerous shape than a visible
-- disagreement); a 30-to-60-minute warm-up (one retail source); and oil-based
-- lube, which sources 1 and 5 both recommend alongside latex gloves while
-- NEITHER states that oil destroys latex — a gap that produces an actively
-- unsafe combination if either page is followed as written.
--
-- THE CORPUS ALREADY HELD THE BEST OF THIS, WHICH IS WHY THE PASS IS SMALL.
-- Measured before writing anything: `fisting` (217 uses) carries a 1,386-char
-- body naming low direct HIV risk, rectal perforation as a surgical emergency,
-- embarrassment rather than availability as the practical obstacle, trimmed
-- nails, gloves, hepatitis C as the infection most associated with the practice,
-- numbing products as specifically a bad idea because pain is the signal, and
-- alcohol and drugs working in the same direction. That is better than any of
-- the six sources and nothing here touches it. `lubricant` already states in its
-- own description that oil-based lube destroys latex — so the gap named in
-- caveat (d) above is ALREADY CLOSED in this corpus, on a different row. Check
-- whether the right answer is already in the corpus before writing it (the
-- `cambria` and `mpox` rule); it was.
--
-- WHAT IS LEFT IS EIGHT ROWS WHERE THE PROSE FAILS ITS OWN ROW, plus one gap.
--
-- DELIBERATELY NOT DONE, each with its reason:
--   * `fisting`, `anal-play` and `lubricant` prose is NOT touched, and the verify
--     block asserts all three survive — sixteen prose writes in one file is
--     exactly the shape that could take a good body with it.
--   * `fistee`'s body is generic but not wrong and closes on consent padding.
--     Round thirteen (77000101100000) measured that no regex separates
--     contentless exhortation from real safety content and refused to sweep it.
--   * `lube` (157 uses) is NOT merged into `lubricant` (63 uses) though they are
--     one concept. Direction is a real editorial call — `lube` has 2.5x the
--     usage and is the community word, `lubricant` holds the prose and the
--     facts — and they sit in different categories. Its NULL summary is filled
--     instead, which destroys nothing. Same for `anal` / `anal-play` /
--     `anal-sex`, three live rows where the latter two hold the bodies, and for
--     `latex` (198 uses) / `mat-latex` (191).
--   * No number is published for warm-up duration, no position is taken on
--     long-term anal tone, and anal botox is not mentioned — see the contested
--     list above.
--   * `impact-toys`, `fidget-toy`, `chew-toy`, `bacchanalia`, `big-toys` and
--     `sextoy` all carry real defects found by the same query (a brand summary
--     on a category row, role-typed rows whose summaries assert the literal
--     object, and one row with all three prose fields empty). None is a fisting
--     subject; they are a role-typing cohort for their own pass.
--   * `anal-fissure`, `hemorrhoids`, `J-Lube`, `nitrile` and `sphincter` are all
--     absent and all stay absent: each sits at one or two sources, and J-Lube is
--     named in `lube`'s new body rather than given a row of its own.
--
-- Guarded by src/lib/__tests__/glossaryFistingPass.test.ts.

select set_config('app.actor', 'migration:99991790451897_glossary_fisting_pass', true);

-- The actor declaration is LOAD-BEARING here: anal-slut, fister, gloves, anal,
-- sounding, anal-fisting and douche are human_reviewed, and
-- log_unified_tag_change() RAISEs "cannot be modified by system:trigger" for an
-- undeclared writer. `lube`, `anal-torture` and `douching` are the opposite case
-- (human_reviewed = false), so for those it is attribution only. Verified live
-- with a REAL value change, since a self-assignment changes no column and fires
-- no trigger, which reads exactly like a permissive one.

create temporary table _fist_before on commit drop as
select slug, description, short_description, long_description
from unified_tags
where slug in ('anal-slut','fister','fistee','gloves','lube','lubricant','anal','anal-play',
               'anal-torture','anal-fisting','douching','douche','sounding','fisting');

-- ── 1. SAYS-NOTHING on an indexable article row ──────────────────────────────
-- `anal-slut` is article, seo_indexable and in search_documents, and it carries
-- the SAME template `piss-slut` carried in 99991790449537: a summary naming no
-- subject over 409 characters that never mention the anus. Its own description
-- ("Person focused on anal activities") establishes the sense, and the
-- reclamation point is the queer-glossary content a general guide omits. The
-- practical half agrees with `anal-play`, which already holds those facts.
update unified_tags set
  short_description = 'Someone enthusiastically into receptive anal — a claimed word, not one to hand out.',
  long_description  = 'Anal slut is a self-claimed label for someone who wants receptive anal sex often and is direct about wanting it. Like the other reclaimed slut words it is worn rather than thrown: applied to someone who has not claimed it, it is simply an insult. Nothing about the label changes the practicalities — the anus produces no lubrication of its own, the tissue tears more easily than it hurts, so pain is a stop signal rather than something to work through, and receptive anal carries the highest per-act HIV risk of the common practices, which is what PrEP, condoms and an undetectable viral load are for.'
where slug = 'anal-slut' and status = 'active'
  and short_description = 'A term associated with sexual preference.';

-- ── 2. NULL BODY on an indexable article row ─────────────────────────────────
-- `/tags/fister` renders one line and stops. Filling a NULL is not the LLM
-- rewrite both auto-apply paths were retired for. The top's job is the part the
-- six sources agree on even where they disagree about everything else.
update unified_tags set long_description =
  'A fister is the giving partner: the one whose hand goes in. The work is almost entirely theirs, and it is patience rather than technique — nails cut short and filed with no rings, gloves on, far more lubricant than seems necessary, and the hand tucked into the narrow shape the practice calls a duck bill so the knuckles are not the leading edge. Going in is slower than anyone expects and coming out is slower still, because a fast withdrawal is its own injury. The top is also the one watching: sharp pain, bright blood or a bottom who has gone quiet are all reasons to stop, and none of them is a reason to be embarrassed at a hospital afterwards. What blunts that judgement on either side — numbing gels, a lot of alcohol, drugs — removes the warning rather than the danger.'
where slug = 'fister' and status = 'active'
  and long_description is null;

-- ── 3. WRONG SENSE on an indexable article row ───────────────────────────────
-- `gloves` is filed Fetishes and its own description is the FETISH ("A fetish
-- for gloves made of leather, latex, rubber, or other materials... barrier
-- protection"), while its summary reads "Garment covering the hand" and its body
-- is generic garment encyclopedia about cold, heat, chemicals and abrasion. The
-- row argues with itself on the page. Gloves are named by all six fisting
-- sources, so the replacement carries the material fact that matters and that
-- caveat (d) shows those sources getting wrong by omission: oil-based lube
-- destroys latex, so nitrile is the glove for it. `lubricant` already states the
-- condom half of the same fact; this states the glove half.
update unified_tags set
  short_description = 'Gloves as fetish material and as barrier — nitrile for anything oil-based.',
  long_description  = 'Gloves do two jobs here and the same pair rarely does both well. As fetish material, leather, latex and rubber each have their own sound, smell and grip, and the appeal is the surface as much as the hand inside it. As a barrier they are the standard precaution for fisting and any hand-to-rectum play: they protect both people, they make a glove change between partners actually mean something, and they put a smooth layer over the nails and cuticles that would otherwise do the scratching. The material decides which lubricant is possible. Oil-based lube destroys latex, so a latex glove with an oil-based lube is the one combination to avoid; nitrile survives it and is also the answer for a latex allergy. Vinyl is the cheapest and the least durable, which for this practice is the wrong trade.'
where slug = 'gloves' and status = 'active'
  and short_description = 'Garment covering the hand';

-- ── 4. WRONG SENSE, found in passing rather than from the sources ────────────
-- `sounding` is article, seo_indexable and in search, its description is correct
-- urethral-play prose, and its summary reads "Body providing non-binding
-- strategic advice" — a sounding BOARD, an advisory committee. Urethral play is
-- not a fisting subject and this row surfaced from the same query rather than
-- from the six sources; it is repaired anyway because the cost is one statement
-- and the alternative is knowingly leaving an advisory-committee summary on the
-- lead line of an indexable kink page. `long_description` stays NULL: writing a
-- urethral-play body is a different subject and a different pass.
update unified_tags set short_description = 'Inserting smooth rods into the urethra for sensation.'
where slug = 'sounding' and status = 'active'
  and short_description = 'Body providing non-binding strategic advice';

-- ── 5. DEFINE-THE-TERM-WITH-THE-TERM, in both fields at once ─────────────────
-- `anal-torture` has `short_description` and `long_description` both set to the
-- literal string "Anal Torture". Its description is serviceable, so both
-- replacements restate the row's own description and CHOOSE NO SENSE beyond it —
-- the group-B discipline. The one fact worth adding is the anatomical reason
-- this differs from impact play elsewhere on the body.
update unified_tags set
  short_description = 'Deliberate pain in and around the anus, as negotiated play.',
  long_description  = 'Anal torture covers deliberately painful anal play: stretching past comfort, slapping, clamps, heat and cold, and toys chosen to hurt rather than to please. What separates it from impact play on the outside of the body is that the tissue here tears before it bruises and the damage is where neither person can see it, so the usual rule that pain is a stop signal is inverted on purpose and has to be replaced by something else — a safe word that is actually used, a hard limit on blood, and a look afterwards. Anything inserted still needs a flared base or a handle, since the rectum draws objects inward regardless of the framing.'
where slug = 'anal-torture' and status = 'active'
  and short_description = 'Anal Torture' and long_description = 'Anal Torture';

-- `anal-fisting` states its own name as its summary and closes its body on the
-- model's own uncertainty ("Information on this topic should be sought from
-- reputable health and sex education sources"). Its description is good. The
-- body defers to `fisting`, which holds the full clinical account, rather than
-- restating it — one corpus, one set of facts.
update unified_tags set
  short_description = 'Insertion of the whole hand into the rectum.',
  long_description  = 'Anal fisting is the rectal case of fisting, and it is the one the safety vocabulary was written for: the rectum is longer, curves, and its wall is thinner than vaginal tissue, so the same hand carries more consequence. Preparation is gradual over a long session rather than a single attempt, with fingers and tapered toys first, a lubricant chosen to last, short filed nails and gloves. Withdrawal is as slow as entry. The specific emergency is perforation of the rectal wall — severe pain, heavy or continuing bleeding, fever, or a rigid painful abdomen afterwards all need urgent care, and delay caused by embarrassment is what turns a repairable injury into a dangerous one.'
where slug = 'anal-fisting' and status = 'active'
  and short_description = 'Anal fisting is a sexual activity.';

-- ── 6. THE NARROWING CLASS ───────────────────────────────────────────────────
-- `douching` describes itself as cleansing "the rectum or vagina" and then its
-- summary says "Vaginal cleansing practice" and its entire body is about the
-- vagina. On this platform the anal case is the overwhelmingly common one, so
-- the row writes most of its readers out of their own entry — the
-- `crotch-rope` / `femme` shape. This is also where caveat (d)'s
-- unanimous-but-incomplete consensus lands: three of the six treat pre-fisting
-- douching as ordinary preparation and NONE of the six names a downside, so the
-- mucosal point below is the thing a reader cannot get from any of them.
update unified_tags set
  short_description = 'Rinsing the rectum or vagina out before sex — useful, and easy to overdo.',
  long_description  = 'Douching means rinsing a body cavity out, and on this platform that usually means the rectum before anal sex or fisting. Plain lukewarm water and a small bulb is the whole method: no soap, no additives, no great volume, and stopping once the water runs clear rather than chasing perfect. The reason for the restraint is that the thing being rinsed away is also a protective layer. Over-douching strips mucus and irritates the lining, and irritated tissue both tears more easily and absorbs more, which raises rather than lowers the risk of the infections people douche to feel clean about. Frequent vaginal douching is worse again, disrupting the bacterial balance and making bacterial vaginosis and thrush more likely, which is why clinicians advise against it there rather than merely cautioning about technique. A bulb is never shared between cavities or between people.'
where slug = 'douching' and status = 'active'
  and short_description = 'Vaginal cleansing practice';

-- `douche` (the device) has the same inversion: its description says the anus,
-- its summary and body say vaginal irrigation. Only the summary is replaced —
-- its body already carries the do-not-share rule, which is correct and stays.
update unified_tags set short_description = 'Bulb or shower attachment for rinsing out the rectum or vagina.'
where slug = 'douche' and status = 'active'
  and short_description = 'Device for introducing water into the body';

-- ── 7. NULL summary on the two highest-usage rows in the family ──────────────
-- `anal` carries 872 assignments — the largest row here — and `lube` 157, and
-- both have a correct description with a NULL summary, so the inline definition
-- card and the /tags index both fall back to the longer field. NULL fills only.
-- Neither gets a body: `anal-play` and `anal-sex` already hold the anal bodies
-- and `lubricant` holds the lubricant facts, so writing a third would be
-- restating them, and both duplicate pairs are named as deferred above.
update unified_tags set short_description = 'Sexual activity involving the anus and rectum.'
where slug = 'anal' and status = 'active'
  and short_description is null;

-- J-Lube is named here rather than given a row: two sources name it, both
-- clinically weighted, and it is a product rather than a concept.
update unified_tags set short_description =
  'Lube. Water-based is condom-safe, silicone lasts longer, oil-based destroys latex.'
where slug = 'lube' and status = 'active'
  and short_description is null;

update unified_tags set long_description =
  'Lube is the one thing no anal or fisting scene works without, because the anus produces none of its own. Water-based is condom-safe and washes out, but it dries and needs topping up. Silicone lasts far longer and survives water, which is why it suits long sessions, but it degrades silicone toys. Oil-based lasts longest of all and destroys latex, so it rules out latex condoms and latex gloves and pairs only with nitrile. For fisting specifically the usual answer is a thick water-based gel or a powder concentrate mixed up in bulk — J-Lube is the common one — because what matters over an hour is volume and staying power rather than feel.'
where slug = 'lube' and status = 'active'
  and long_description is null;

-- ── 8. The one gap, and one alias that routes nothing ────────────────────────
-- The duck bill is named by five of the six sources under four spellings (duck
-- bill, duckbill, duck hand, silent duck) and is absent from the corpus under
-- every one of them. It earns a row because it is the single piece of technique
-- every source teaches and a reader can act on it. See the piss-play pass
-- (99991790449537) for why a new row lands as `utility`: the readiness gate
-- demotes `article` unless prose_reviewed_at, the ontology decision and the
-- localisation decision are all settled, and all three default to pending on any
-- INSERT. All three category representations are written by hand because neither
-- category trigger fires on INSERT (the 194-row finding of 50100101100100).
insert into unified_tags (
  name, slug, description, short_description, long_description,
  category_id, category, status, publication_role, seo_indexable,
  human_reviewed, is_adult, is_sensitive, usage_count
)
select
  'Duck Bill', 'duck-bill',
  'The tucked hand shape used to enter for fisting, with the fingers and thumb drawn together so the knuckles are not the widest leading edge.',
  'The tucked hand shape used to enter for fisting.',
  'The duck bill is the hand shape fisting is entered with: fingers held together and the thumb tucked into the palm or across it, so the hand goes in as a narrow tapering wedge rather than leading with the knuckles, which are the widest part. Some people call it the silent duck. Once inside, the hand usually relaxes into a loose fist rather than staying in the shape, and the same wedge in reverse is how it comes out — slowly, because a fast withdrawal is its own injury. It is the one piece of technique every beginner guide teaches, and the reason is anatomical rather than stylistic: the shape presents the smallest cross-section to the tightest ring.',
  c.id, c.name, 'active', 'article', false,
  true, true, false, 0
from tag_categories c
where c.slug = 'practices-play'
  and not exists (select 1 from unified_tags t where t.slug = 'duck-bill')
  and not exists (select 1 from tag_aliases a where a.alias_slug = 'duck-bill');

insert into tag_category_assignments (tag_id, category_id, is_primary)
select t.id, c.id, true
from unified_tags t
join tag_categories c on c.slug = 'practices-play'
where t.slug = 'duck-bill'
  and not exists (
    select 1 from tag_category_assignments x where x.tag_id = t.id and x.is_primary
  );

-- Aliases: the other three spellings route onto the row above. `approved`, not
-- `auto` — display, auto-tagging and the search bridge have all been
-- approved-only since 20261012090000, so an `auto` alias routes nothing.
insert into tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
select t.id, v.nm, v.sl, 'synonym', 'approved'
from (values
  ('duck-bill', 'Duckbill',    'duckbill'),
  ('duck-bill', 'Silent Duck', 'silent-duck'),
  ('duck-bill', 'Duck Hand',   'duck-hand')
) as v(on_slug, nm, sl)
join unified_tags t on t.slug = v.on_slug and t.status = 'active'
where not exists (select 1 from tag_aliases a where a.alias_slug = v.sl)
  and not exists (select 1 from unified_tags x where lower(x.name) = lower(v.nm));

-- `handballing` is the older gay term for fisting and it already exists as an
-- alias on `fisting` — at review_status 'auto', which since 20261012090000
-- means it is displayed nowhere, auto-tags nothing and is invisible to the
-- search bridge. Promoting it is a one-column change that makes an existing
-- correct alias actually route.
update tag_aliases a set review_status = 'approved'
from unified_tags t
where a.canonical_tag_id = t.id
  and t.slug = 'fisting'
  and a.alias_slug = 'handballing'
  and a.review_status = 'auto';

do $verify$
declare
  v_scope     int;
  v_nothing   int;
  v_uncertain int;
  v_wrong     int;
  v_filled    int;
  v_thin      int;
  v_new       int;
  v_cats      int;
  v_aliases   int;
  v_handball  int;
  v_refusals  int;
  v_collat    int;
begin
  -- Soft on preconditions: a row a concurrent session merged or deprecated drops
  -- out of scope rather than aborting db push for the whole repo.
  select count(*) into v_scope from unified_tags
   where status = 'active'
     and slug in ('anal-slut','fister','gloves','sounding','anal-torture',
                  'anal-fisting','douching','douche','anal','lube');
  if v_scope < 9 then
    raise exception 'fisting pass: only % of 10 target rows are still active - refusing to report success on a corpus that moved out from under the file', v_scope;
  end if;

  -- 1. No target still says nothing or names only itself. Keyed on the WRONG
  --    text, so a better fix written by a concurrent session also satisfies it.
  select count(*) into v_nothing from unified_tags
   where status = 'active'
     and (
       (slug = 'anal-slut'    and short_description = 'A term associated with sexual preference.')
    or (slug = 'anal-torture' and (short_description = 'Anal Torture' or long_description = 'Anal Torture'))
    or (slug = 'anal-fisting' and short_description = 'Anal fisting is a sexual activity.')
     );
  if v_nothing <> 0 then
    raise exception 'fisting pass: % row(s) still publish prose that names no subject', v_nothing;
  end if;

  -- 2. No row ships the model's own uncertainty as a definition.
  select count(*) into v_uncertain from unified_tags
   where status = 'active'
     and slug in ('anal-fisting','anal-slut','fister','gloves','douching','lube')
     and long_description like '%should be sought from reputable%';
  if v_uncertain <> 0 then
    raise exception 'fisting pass: % row(s) still publish the model uncertainty tail', v_uncertain;
  end if;

  -- 3. The three wrong-sense / narrowed summaries are gone.
  select count(*) into v_wrong from unified_tags
   where status = 'active'
     and ((slug = 'gloves'   and short_description = 'Garment covering the hand')
       or (slug = 'sounding' and short_description = 'Body providing non-binding strategic advice')
       or (slug = 'douching' and short_description = 'Vaginal cleansing practice')
       or (slug = 'douche'   and short_description = 'Device for introducing water into the body'));
  if v_wrong <> 0 then
    raise exception 'fisting pass: % wrong-sense summary/summaries remain', v_wrong;
  end if;

  -- 4. Stated POSITIVELY: the four NULL fills landed. "The defect is gone" is
  --    satisfied by a row that vanished from the corpus entirely.
  --
  --    Counted per FIELD, not per row. The first draft used a single count(*)
  --    with an OR and `lube` contributes TWO of the four fields, so the maximum
  --    reachable value was 3 and the check failed on correct data — the dry run
  --    caught it. `count(*) filter` counts the fields the file actually writes.
  select count(*) filter (where slug = 'fister' and coalesce(btrim(long_description),'')  <> '')
       + count(*) filter (where slug = 'anal'   and coalesce(btrim(short_description),'') <> '')
       + count(*) filter (where slug = 'lube'   and coalesce(btrim(short_description),'') <> '')
       + count(*) filter (where slug = 'lube'   and coalesce(btrim(long_description),'')  <> '')
    into v_filled
    from unified_tags
   where status = 'active' and slug in ('fister','anal','lube');
  if v_filled <> 4 then
    raise exception 'fisting pass: expected 4 filled fields, found %', v_filled;
  end if;

  -- 5. Nothing became unpublishable. CALL the real predicate rather than
  --    restating its OR, which is a different and stricter check.
  select count(*) into v_thin from unified_tags
   where status = 'active'
     and slug in ('anal-slut','fister','gloves','sounding','anal-torture',
                  'anal-fisting','douching','douche','anal','lube','duck-bill')
     and not tag_has_prose(description, short_description);
  if v_thin <> 0 then
    raise exception 'fisting pass: % row(s) fail tag_has_prose', v_thin;
  end if;

  -- 6. The creation exists, is unpublished, and carries all THREE category
  --    representations. `utility` is the REACHED state: the readiness gate
  --    demotes a new row because three of its six conditions default to
  --    pending/NULL. Asserting 'article' here fails on correct code.
  select count(*) into v_new from unified_tags
   where slug = 'duck-bill' and status = 'active'
     and publication_role = 'utility'
     and seo_indexable = false
     and seo_deindex_reason = 'publication_role:utility'
     and human_reviewed = true
     and coalesce(btrim(category),'') <> '' and category_id is not null;
  if v_new <> 1 then
    raise exception 'fisting pass: duck-bill is missing, published, or has no category text';
  end if;

  select count(*) into v_cats
    from unified_tags t join tag_category_assignments a on a.tag_id = t.id
   where t.slug = 'duck-bill' and a.is_primary;
  if v_cats <> 1 then
    raise exception 'fisting pass: duck-bill has % primary category junction rows, expected 1', v_cats;
  end if;

  -- 7. All three spelling aliases route and are APPROVED.
  select count(*) into v_aliases
    from tag_aliases a join unified_tags t on t.id = a.canonical_tag_id
   where a.alias_slug in ('duckbill','silent-duck','duck-hand')
     and a.review_status = 'approved' and t.slug = 'duck-bill' and t.status = 'active';
  if v_aliases <> 3 then
    raise exception 'fisting pass: % of 3 duck-bill aliases are approved and on the active row', v_aliases;
  end if;

  select count(*) into v_handball
    from tag_aliases a join unified_tags t on t.id = a.canonical_tag_id
   where t.slug = 'fisting' and a.alias_slug = 'handballing' and a.review_status = 'approved';
  if v_handball <> 1 then
    raise exception 'fisting pass: the handballing alias on fisting is not approved';
  end if;

  -- 8. THE REFUSALS, MADE ENFORCEABLE. Sixteen prose writes in one file is
  --    exactly the shape that takes a good body with it, so the three bodies
  --    this pass deliberately did not touch are asserted to survive, plus
  --    round thirteen's consent-padding refusal on fistee.
  --    Counted per CLAIM, not per row: `fisting` carries two of the five and is
  --    one row, so a single count(*) with an OR maxes out at 4 and fails on
  --    correct data. The dry run caught this here too, in the same shape as the
  --    fill count above — a count(*) over an OR counts ROWS, and both of these
  --    checks are about FIELDS and CLAIMS.
  select count(*) filter (where slug = 'fisting'   and long_description like '%hepatitis C%')
       + count(*) filter (where slug = 'fisting'   and long_description like '%Numbing products are specifically a bad idea%')
       + count(*) filter (where slug = 'anal-play' and long_description like '%flared base or a retrievable handle%')
       + count(*) filter (where slug = 'lubricant' and description      like '%oil-based lube destroys latex condoms%')
       + count(*) filter (where slug = 'fistee'    and long_description like '%prioritize consent and safety%')
    into v_refusals
    from unified_tags
   where status = 'active'
     and slug in ('fisting','anal-play','lubricant','fistee');
  if v_refusals <> 5 then
    raise exception 'fisting pass: only % of 5 deliberately-untouched prose claims survive', v_refusals;
  end if;

  -- 9. PROVE the scope rather than asserting it. No `description` column may
  --    move anywhere: this pass writes summaries and bodies only.
  select count(*) into v_collat
    from _fist_before b join unified_tags t on t.slug = b.slug
   where t.description is distinct from b.description
      or (t.short_description is distinct from b.short_description
            and b.slug not in ('anal-slut','gloves','sounding','anal-torture',
                               'anal-fisting','douching','douche','anal','lube'))
      or (t.long_description  is distinct from b.long_description
            and b.slug not in ('anal-slut','fister','gloves','anal-torture',
                               'anal-fisting','douching','lube'));
  if v_collat <> 0 then
    raise exception 'fisting pass: % row(s) had a prose column move that this file does not write', v_collat;
  end if;

  raise notice 'fisting pass OK: scope %, says-nothing 0, wrong-sense 0, filled 4, created 1, aliases 3, handballing approved, refusals 5, collateral 0',
    v_scope;
end
$verify$;
