-- Sex & sexual-health glossary pass, part 3 of 3: genuinely absent terms.
--
-- 240 of the 598 working-set headwords matched nothing -- no tag, no alias, no
-- tag NAME. That is not 240 gaps. Hand-reading them splits three ways, and the
-- two groups that are NOT created are the larger and the more interesting.
--
-- NINE INTENDED CREATIONS WERE STOPPED BY A TWIN CHECK, AND THAT IS THE MOST
-- USEFUL THING IN THIS FILE. Before inserting anything, every candidate slug was
-- probed against its own plural, singular and de-hyphenated forms. Nine already
-- existed under a different spelling:
--   metamour (ACTIVE, real body)      <- looked up as `metamours`
--   ddlg (ACTIVE, real body)          <- looked up as `dd-lg`
--   footjob (ACTIVE, real body)       <- `foot-job`
--   handjob (ACTIVE, EMPTY body)      <- `hand-job`
--   fraysexual (deprecated, body)     <- `fraysexuality`
--   fallopian-tubes (deprecated)      <- `fallopian-tube`
--   hookup (deprecated, WRONG body)   <- `hook-up`
--   packers (deprecated, body)        <- `packer`
--   seminal-vesicles (deprecated)     <- `seminal-vesicle`
-- Five went to part 2 to be REVIVED instead; the four active ones are aliased
-- here, and `handjob`'s empty description is filled. Without that probe this
-- file would have minted nine duplicates, which is exactly what the alias-shadow
-- guard and the `lesbophobia` finding exist to prevent. A slug being absent is
-- not evidence the concept is.
--
-- CREATED (55). Real vocabulary a reader of this site would look up and cannot
-- currently find: ace-spectrum identities (greysexual, apothisexual,
-- sex-repulsed), polyamory structure (kitchen-table polyamory, fluid bonding),
-- modern dating vocabulary (talking stage, benching, orbiting, breadcrumbing,
-- roster, DTR, simping), anatomy the corpus had holes in (areola, clitoral
-- hood, erogenous zone, endometrium, rectum, shaft, smegma, erection,
-- genitals), menstrual and reproductive health (PMS, PMDD, menarche,
-- amenorrhoea, PCOS, menstrual cup, tampon, pad, spotting, vaginal discharge,
-- TSS), sexual health (UTI, yeast infection, jock itch, spermicide, diaphragm,
-- cervical cap, IUD, vasectomy), and the sex acts and kinks the listicles agree
-- on (thigh job, French kissing, motorboating, sixty-nine, rainbow kiss, dirty
-- talk, sploshing, shrimping, jelqing, tantric sex, mile-high club, period sex,
-- postcoital dysphoria, outercourse).
--
-- ALIASED, NOT CREATED (25). These are other spellings of rows that already
-- exist, and minting a second row for one concept is what the alias-shadow
-- guard exists to stop -- the `lesbophobia` lesson. clit -> clitoris,
-- balls/testicles -> testicle, dick -> penis, hard-on -> erection,
-- impotence -> erectile-dysfunction, prepuce -> foreskin, period/menses ->
-- menstruation, nocturnal emission/wet dream -> wet-dreams, STD -> sti,
-- thrush -> yeast-infection, crabs -> pubic-lice, plan B -> morning-after-pill,
-- MSM/WSW -> their spelled-out rows. Aliases are `approved`, not `auto`,
-- because since 20261012090000 display, auto-tagging and the search bridge are
-- ALL approved-only, so an `auto` alias routes nothing.
--
-- NOT CREATED, and each group has a reason rather than "did not get to them":
--
--   * SINGLE-LISTICLE COINAGES (12): amazon, doppelbanger, hotline-bling,
--     mastuwaiting, postboned, roaching, submarining, venus-butterfly, shocker,
--     dirty-sanchez, eater, facefuck. Each appears in exactly one source and
--     nowhere else in 34. Minting one-sentence rows for one-source coinages is
--     precisely how the "rope <animal>" cohort happened (50500101100000).
--
--   * GENERAL CLINICAL VOCABULARY (~50): biopsy, laparoscopy, lymph nodes,
--     corpus luteum, follicle-stimulating hormone, seminiferous tubules,
--     ultrasound, midwife, trimester, placenta, cryptorchidism, Peyronie's
--     disease... These come from WebMD and Planned Parenthood, which are
--     general health glossaries. This is a queer travel and community
--     glossary; a reader looking up "seminiferous tubules" is not served by us
--     having a thin row about it.
--
--   * OWN-PASS SUBJECTS (~15): race, ethnicity, racism, sexism, misogyny,
--     privilege, colonialism are real vocabulary and belong in a pass with
--     their siblings, not bolted onto a sex-terms sweep. Likewise the
--     sexual-violence set (acquaintance rape, date rape, statutory rape,
--     incest, sodomy law): those need care and corroboration this pass did not
--     give them, and a thin row on that subject is worse than no row.
--
--   * COMPOUND EXTRACTION RESIDUE (~20): "bisexual-person",
--     "closeted-in-the-closet", "friends-with-benefits-fuck-buddy",
--     "trans-transgender-person", "msm-wsw", "polyamory-polyamorous" -- source
--     headwords that join two spellings with a slash. Not concepts.
--
--   * `sex-change-operation` is deliberately refused. It is outdated and the
--     current term is gender-affirming surgery; creating the row would publish
--     the outdated phrasing as a headword. `trans-health` already covers it.
--
-- EVERY NEW ROW SETS ALL THREE CATEGORY REPRESENTATIONS BY HAND. Neither
-- category trigger fires on INSERT -- trg_sync_tag_category is BEFORE UPDATE
-- and trg_sync_tag_category_after is AFTER UPDATE OF category_id -- so a row
-- created with category_id alone derives no `category` text and mints no
-- tag_category_assignments row. Since /tags/:slug renders the JUNCTION and the
-- search facet renders the TEXT, such a row is uncategorised on its own page
-- and categorised in search. That is the 194-row finding of 50100101100100,
-- still unrepaired corpus-wide; this file does not add to it.
--
-- Created UNPUBLISHED (seo_indexable = false) and human_reviewed = true: the
-- gap being closed is site search, and putting 55 new pages into the crawler
-- index is a separate decision. human_reviewed is load-bearing, not decorative
-- -- deprecate_unused_tags() selects exactly active + not-reviewed + usage 0,
-- which is all 55 on day one.
--
-- Guarded by src/lib/__tests__/sexGlossaryPass.test.ts.

begin;

select set_config('app.actor', 'migration:99991789812141_sex_glossary_creations', true);

create temporary table _new_tags (
  slug text primary key, name text not null, cat text not null,
  descr text not null, summ text not null,
  adult boolean not null default false, sensitive boolean not null default false
) on commit drop;

insert into _new_tags (slug, name, cat, descr, summ, adult, sensitive) values
-- ---- ace spectrum
('greysexual','Greysexual','sexual-orientation','Sitting between asexual and allosexual: sexual attraction happens, but rarely, weakly, or only under particular conditions. Also spelled graysexual or grey-ace.','Rare or conditional sexual attraction, between asexual and allosexual.',false,false),
('apothisexual','Apothisexual','sexual-orientation','An asexual person who is actively repulsed by sex, rather than simply uninterested. A description of one''s own feelings, not a judgement of anyone else''s.','Asexual and sex-repulsed rather than merely uninterested.',false,false),
('sex-repulsed','Sex-repulsed','sexual-orientation','Finding the idea of sex for oneself actively off-putting. Common among asexual people but not limited to them, and distinct from sex-averse or sex-indifferent.','Actively put off by the idea of sex for oneself.',false,false),
-- ---- polyamory / relationship structure
('kitchen-table-polyamory','Kitchen Table Polyamory','relationship-structures','A style of polyamory where everyone in the network is comfortable enough to sit round the same table — metamours know each other and spend time together socially.','Polyamory where metamours know each other and socialise together.',false,false),
('fluid-bonding','Fluid Bonding','safer-sex','Deciding with a partner to stop using barriers between you. A negotiated agreement that normally rests on recent testing and clear rules about everyone else, not a default that arrives by drift.','Agreeing with a partner to have sex without barriers.',true,false),
-- ---- dating vocabulary
('talking-stage','Talking Stage','dating-connection','The stretch before anything is defined: talking regularly, maybe meeting, without either person having named what it is.','The undefined stretch before a relationship is named.',false,false),
('dtr','DTR','dating-connection','Short for "define the relationship" — the conversation where two people say out loud what they are to each other.','The "define the relationship" conversation.',false,false),
('benching','Benching','dating-connection','Keeping someone in reserve: enough contact to stop them leaving, never enough to go anywhere. Named for a substitute who is never put on.','Keeping someone in reserve with just enough contact.',false,false),
('orbiting','Orbiting','dating-connection','Cutting off contact but staying visible — watching every story, liking the odd post, never replying.','Going quiet but still watching all your posts.',false,false),
('breadcrumbing','Breadcrumbing','dating-connection','Dropping just enough attention to keep someone interested with no intention of going further.','Occasional attention with no intention of following through.',false,false),
('roster','Roster','dating-connection','The set of people someone is loosely seeing at once, none of them exclusive.','The group of people someone is casually seeing at once.',false,false),
('simping','Simping','slang-terminology','Slang for putting excessive effort into someone who gives little back. Usually said of someone else, rarely of oneself, and often unfairly.','Slang for over-investing in someone who gives little back.',false,false),
('mile-high-club','Mile High Club','practices-play','Having sex on an aircraft in flight. Worth knowing that cabin crew and airlines treat it as a disciplinary or policing matter, not a joke.','Having sex on a plane in flight.',true,false),
-- ---- trans gear
-- ---- anatomy
('areola','Areola','physical-reproductive','The ring of darker skin around the nipple. Size and colour vary enormously between people and change with hormones, pregnancy and age.','The ring of darker skin around the nipple.',false,false),
('clitoral-hood','Clitoral Hood','physical-reproductive','The fold of skin covering the external tip of the clitoris. It protects a very densely nerved structure, which is why direct contact is uncomfortable for many people.','The fold of skin covering the tip of the clitoris.',false,false),
('erogenous-zone','Erogenous Zone','physical-reproductive','Any part of the body where touch produces sexual feeling. The genitals are the obvious ones; the neck, ears, inner thighs, scalp and lower back are common and the map differs per person.','Any part of the body where touch produces sexual feeling.',false,false),
('endometrium','Endometrium','physical-reproductive','The lining of the uterus. It thickens across the menstrual cycle and is what is shed during a period.','The uterine lining that is shed during a period.',false,false),
('rectum','Rectum','physical-reproductive','The final section of the large intestine, above the anus. Its tissue is thin and absorbs readily, which is why receptive anal sex carries a higher HIV risk than other acts and why lube matters.','The final section of the bowel, above the anus.',false,false),
('shaft','Shaft','physical-reproductive','The length of the penis between the head and the body.','The length of the penis between the head and the body.',false,false),
('smegma','Smegma','sexual-health','Natural build-up of skin cells and oil under the foreskin or around the clitoral hood. Ordinary, and washed away with warm water — no soap needed inside the foreskin.','Natural build-up under the foreskin or clitoral hood.',false,false),
('erection','Erection','physical-reproductive','The penis or clitoris stiffening and swelling as blood flow increases during arousal. It can also happen without arousal, and arousal does not always produce one.','Stiffening of the penis or clitoris as blood flow increases.',false,false),
('genitals','Genitals','physical-reproductive','The external sex organs. What someone has says nothing about their gender — the words for body parts and the words for people are separate vocabularies.','The external sex organs.',false,false),
('phallic','Phallic','slang-terminology','Resembling or representing a penis, or relating to it symbolically.','Resembling or symbolising a penis.',false,false),
-- ---- menstrual & reproductive health
('premenstrual-syndrome','Premenstrual Syndrome','physical-reproductive','Physical and mood changes in the days before a period — cramps, tenderness, irritability, low mood, disrupted sleep. Common, and treatable when it interferes with life.','Physical and mood changes in the days before a period.',false,false),
('premenstrual-dysphoric-disorder','Premenstrual Dysphoric Disorder','mental-health','A severe form of premenstrual syndrome, with mood symptoms heavy enough to disrupt work and relationships. A recognised diagnosis, not an exaggeration of ordinary PMS.','Severe premenstrual mood symptoms heavy enough to disrupt daily life.',false,false),
('menarche','Menarche','physical-reproductive','A person''s first period.','A person''s first period.',false,false),
('amenorrhoea','Amenorrhoea','physical-reproductive','Periods stopping, or never starting. Causes range from pregnancy and hormonal contraception to testosterone therapy, stress, weight change and thyroid conditions.','Absent periods, from any of several causes.',false,false),
('polycystic-ovary-syndrome','Polycystic Ovary Syndrome','physical-reproductive','A hormonal condition causing irregular or absent periods, raised androgen levels, and often insulin resistance. Common, under-diagnosed, and manageable.','Hormonal condition causing irregular periods and raised androgens.',false,false),
('menstrual-cup','Menstrual Cup','physical-reproductive','A reusable silicone cup worn internally to collect menstrual blood. Emptied every few hours, lasts years, and produces no waste.','Reusable silicone cup that collects menstrual blood.',false,false),
('tampon','Tampon','physical-reproductive','An absorbent plug worn internally during a period. Change it at least every eight hours — leaving one in far longer is the main risk factor for toxic shock syndrome.','Absorbent plug worn internally during a period.',false,false),
('sanitary-pad','Sanitary Pad','physical-reproductive','An absorbent pad worn in the underwear during a period.','Absorbent pad worn in the underwear during a period.',false,false),
('spotting','Spotting','physical-reproductive','Light bleeding outside a normal period. Often harmless — common on hormonal contraception or mid-cycle — but persistent or post-menopausal spotting is worth a check.','Light bleeding outside a normal period.',false,false),
('vaginal-discharge','Vaginal Discharge','sexual-health','Fluid produced by the vagina and cervix, which self-cleans the vagina. Amount and texture change across the cycle; a sudden change in colour, smell or itch is what warrants a test.','Normal fluid that keeps the vagina clean; changes can signal infection.',false,false),
('toxic-shock-syndrome','Toxic Shock Syndrome','sexual-health','A rare but rapidly dangerous bacterial illness linked to leaving tampons, cups or other internal devices in too long. Sudden high fever, rash and vomiting mean emergency care, not a wait-and-see.','Rare, fast-moving illness linked to internal products left in too long.',false,false),
-- ---- sexual health
('urinary-tract-infection','Urinary Tract Infection','sexual-health','A bacterial infection of the urinary tract, causing burning on urination and constant urgency. Sex can trigger one; it is not an STI, and it is treated with antibiotics.','Bacterial infection of the urinary tract; sex can trigger it.',false,false),
('yeast-infection','Yeast Infection','sexual-health','Overgrowth of candida producing itching, soreness and thick discharge. Also called thrush. Not an STI, though it can pass between partners.','Candida overgrowth causing itching and discharge. Also called thrush.',false,false),
('jock-itch','Jock Itch','sexual-health','A fungal rash in the groin, thriving in warmth and damp. Common, easily treated with antifungal cream, and not an STI.','Fungal groin rash — common, treatable, not an STI.',false,false),
('spermicide','Spermicide','safer-sex','A chemical that immobilises sperm, used with barrier methods. It does not prevent STIs, and frequent use of nonoxynol-9 can irritate tissue enough to raise HIV risk.','Chemical contraceptive that kills sperm; no STI protection.',false,false),
('diaphragm','Diaphragm','safer-sex','A shallow silicone cup placed over the cervix before sex, used with spermicide. Contraception only — no STI protection.','Silicone cup over the cervix; contraception only.',false,false),
('cervical-cap','Cervical Cap','safer-sex','A small cup fitted over the cervix to block sperm, used with spermicide. Contraception only.','Small cup fitted over the cervix to block sperm.',false,false),
('intrauterine-device','Intrauterine Device','safer-sex','A small device placed in the uterus for years-long contraception, either copper or hormonal. Highly effective, and no protection against STIs.','Long-term contraceptive device placed in the uterus.',false,false),
('vasectomy','Vasectomy','safer-sex','A minor surgical procedure cutting or sealing the tubes that carry sperm. Permanent contraception; it changes nothing about erection, orgasm or ejaculate volume.','Permanent contraception by sealing the sperm ducts.',false,false),
('outercourse','Outercourse','practices-play','Sex without penetration — hands, mouths, rubbing, toys. Carries a lower STI risk than penetrative sex rather than none.','Sex without penetration.',true,false),
('postcoital-dysphoria','Postcoital Dysphoria','mental-health','Feeling low, tearful or anxious after sex that was wanted and consensual. Common, poorly known, and not a sign that something went wrong.','Feeling low or tearful after consensual, wanted sex.',false,false),
-- ---- acts & kinks
('thigh-job','Thigh Job','practices-play','Thrusting between a partner''s closed thighs. Also called intercrural sex.','Thrusting between a partner''s closed thighs.',true,false),
('sixty-nine','Sixty-Nine','sex-positions','Two people giving each other oral sex at the same time, bodies head-to-toe.','Giving each other oral sex at the same time.',true,false),
('french-kissing','French Kissing','practices-play','Kissing with tongues.','Kissing with tongues.',false,false),
('motorboating','Motorboating','practices-play','Putting your face between a partner''s breasts and shaking your head side to side.','Shaking your face between a partner''s breasts.',true,false),
('dirty-talk','Dirty Talk','practices-play','Talking explicitly during sex — describing, instructing, praising or narrating. Like any other act, what lands depends entirely on what has been agreed.','Talking explicitly during sex.',true,false),
('period-sex','Period Sex','practices-play','Sex during menstruation. Safe, often relieves cramps, and worth knowing that blood raises the transmission risk for HIV and several other STIs, so barriers matter more, not less.','Sex during menstruation.',true,false),
('rainbow-kiss','Rainbow Kiss','practices-play','Partners performing oral sex during menstruation and then kissing, mixing blood and semen. Blood contact makes this a higher-risk act for HIV and hepatitis than either act alone.','Kissing after oral sex during menstruation, mixing blood and semen.',true,true),
('sploshing','Sploshing','fetishes-interests','Arousal from food and wet, messy substances on the body — cream, custard, cake, mud.','Arousal from food and messy substances on the body.',true,false),
('shrimping','Shrimping','fetishes-interests','Sucking a partner''s toes.','Sucking a partner''s toes.',true,false),
('jelqing','Jelqing','sexual-health','A repetitive manual stretching technique claimed to enlarge the penis. No evidence that it works, and documented reports of bruising, scarring and erectile problems.','Manual penis-stretching technique — unproven and linked to injury.',true,false),
('tantric-sex','Tantric Sex','practices-play','A slow approach to sex drawn from tantric practice, built on breath, eye contact and delayed release rather than on reaching orgasm.','Slow sex built on breath and delay rather than reaching orgasm.',true,false);

-- Insert the rows, then wire all three category representations by hand.
insert into unified_tags (
  name, slug, description, short_description, category_id, category,
  status, seo_indexable, human_reviewed, is_adult, is_sensitive, usage_count
)
select n.name, n.slug, n.descr, n.summ, c.id, c.name,
       'active', false, true, n.adult, n.sensitive, 0
from _new_tags n
join tag_categories c on c.slug = n.cat
where not exists (select 1 from unified_tags t where t.slug = n.slug)
  and not exists (select 1 from tag_aliases a where a.alias_slug = n.slug);

insert into tag_category_assignments (tag_id, category_id, is_primary)
select t.id, c.id, true
from _new_tags n
join unified_tags t on t.slug = n.slug
join tag_categories c on c.slug = n.cat
where not exists (
  select 1 from tag_category_assignments x where x.tag_id = t.id and x.is_primary
);

-- ---- the one twin that is ACTIVE with an EMPTY description.
-- `handjob` renders today with nothing on it. Filling a NULL/empty field is not
-- the LLM rewrite both auto-apply paths were retired for, and it is the reason
-- `hand-job` is aliased rather than created.
update unified_tags set
  description = 'Stimulating a partner''s genitals with the hand.'
where slug = 'handjob' and status = 'active'
  and coalesce(btrim(description), '') = '';

-- ---- aliases: other spellings of rows that already exist.
-- `approved`, not `auto`: since 20261012090000 display, auto-tagging and the
-- search bridge are all approved-only, so an `auto` alias routes nothing.
insert into tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
select t.id, v.alias, v.aslug, v.atype, 'approved'
from (values
  -- the four ACTIVE twins the creation list tried to duplicate
  ('handjob','Hand Job','hand-job','synonym'),
  ('footjob','Foot Job','foot-job','synonym'),
  ('ddlg','DD/lg','dd-lg','synonym'),
  ('metamour','Metamours','metamours','synonym'),
  ('clitoris','Clit','clit','synonym'),
  ('testicle','Balls','balls','synonym'),
  ('testicle','Testicles','testicles','synonym'),
  ('penis','Dick','dick','synonym'),
  ('erection','Hard-on','hard-on','synonym'),
  ('erection','Boner','boner','synonym'),
  ('erectile-dysfunction','Impotence','impotence','synonym'),
  ('foreskin','Prepuce','prepuce','synonym'),
  ('menstruation','Period','period','synonym'),
  ('menstruation','Menses','menses','synonym'),
  ('wet-dreams','Nocturnal Emission','nocturnal-emission','synonym'),
  ('sti','STD','std','abbreviation'),
  ('yeast-infection','Thrush','thrush','synonym'),
  ('premenstrual-syndrome','PMS','pms','abbreviation'),
  ('premenstrual-dysphoric-disorder','PMDD','pmdd','abbreviation'),
  ('polycystic-ovary-syndrome','PCOS','pcos','abbreviation'),
  ('urinary-tract-infection','UTI','uti','abbreviation'),
  ('toxic-shock-syndrome','TSS','tss','abbreviation'),
  ('intrauterine-device','IUD','iud','abbreviation'),
  ('erogenous-zone','Erogenous Zones','erogenous-zones','synonym'),
  ('fallopian-tubes','Fallopian Tube','fallopian-tube','synonym'),
  ('seminal-vesicles','Seminal Vesicle','seminal-vesicle','synonym'),
  ('hookup','Hook-up','hook-up','synonym'),
  ('packers','Packer','packer','synonym')
) as v(target, alias, aslug, atype)
join unified_tags t on t.slug = v.target and t.status = 'active'
where not exists (select 1 from tag_aliases a where a.alias_slug = v.aslug)
  and not exists (select 1 from unified_tags u where u.slug = v.aslug)
  -- tag_reject_alias_shadow() also refuses an alias matching an existing tag NAME
  and not exists (select 1 from unified_tags u2 where lower(btrim(u2.name)) = lower(v.alias));

-- ============================ postconditions ============================
do $verify$
declare v_bad int; v_n int; v_miss text;
begin
  -- 1. every new row exists, is active, unpublished, reviewed, and has prose
  select count(*) into v_n from unified_tags t join _new_tags n on n.slug = t.slug
  where t.status = 'active' and t.seo_indexable = false and t.human_reviewed
    and tag_has_prose(t.description, t.short_description);
  if v_n <> (select count(*) from _new_tags) then
    select string_agg(n.slug, ', ') into v_miss from _new_tags n
      left join unified_tags t on t.slug = n.slug
      where t.id is null or not (t.status='active' and t.seo_indexable=false and t.human_reviewed);
    raise exception 'expected % new rows in the reached state, found %. missing: %',
      (select count(*) from _new_tags), v_n, coalesce(v_miss,'(none)');
  end if;

  -- 2. ALL THREE category representations agree on every new row. Asserting
  --    category_id alone is the vacuous form -- it is the lever, not the result,
  --    and neither category trigger fires on INSERT.
  select count(*) into v_bad from _new_tags n
  join unified_tags t on t.slug = n.slug
  join tag_categories c on c.slug = n.cat
  where t.category_id is distinct from c.id
     or t.category is distinct from c.name
     or not exists (select 1 from tag_category_assignments a
                    where a.tag_id = t.id and a.category_id = c.id and a.is_primary);
  if v_bad <> 0 then
    raise exception '% new rows disagree across category_id / category text / junction', v_bad;
  end if;

  -- 3. nothing created here is indexable
  select count(*) into v_bad from unified_tags t join _new_tags n on n.slug = t.slug
  where t.seo_indexable;
  if v_bad <> 0 then raise exception '% newly created rows are indexable', v_bad; end if;

  -- 4. no duplicate was minted: no new slug shadows an existing alias, and no
  --    new alias shadows an existing tag name
  select count(*) into v_bad from _new_tags n
  join tag_aliases a on a.alias_slug = n.slug
  join unified_tags t on t.id = a.canonical_tag_id and t.slug <> n.slug;
  if v_bad <> 0 then raise exception '% created rows shadow an existing alias', v_bad; end if;

  -- 5. the refused groups stay refused, so a later pass does not re-propose them
  select count(*) into v_bad from unified_tags
  where slug in ('amazon','doppelbanger','hotline-bling','mastuwaiting','postboned','roaching',
                 'submarining','venus-butterfly','shocker','dirty-sanchez','sex-change-operation');
  if v_bad <> 0 then
    raise exception '% deliberately-refused terms were created after all', v_bad;
  end if;

  -- 6. at least 18 aliases landed (a silently-empty insert would satisfy every
  --    "no bad alias" check above while routing nothing)
  select count(*) into v_n from tag_aliases
  where alias_slug in ('clit','balls','testicles','dick','hard-on','boner','impotence','prepuce',
                       'period','menses','nocturnal-emission','std','thrush','pms','pmdd','pcos',
                       'uti','tss','iud','metamours','erogenous-zones','hand-job','foot-job',
                       'dd-lg','fallopian-tube','seminal-vesicle','hook-up','packer');
  if v_n < 18 then raise exception 'only % of 25 aliases are present', v_n; end if;

  -- 7. the nine twins the creation list would have duplicated are each reachable
  --    under exactly ONE row, and none of them has an empty body any more. This
  --    is the check that would have caught the duplicates had they been minted.
  select count(*) into v_bad from unified_tags
  where slug in ('metamour','ddlg','footjob','handjob','fraysexual','fallopian-tubes',
                 'hookup','packers','seminal-vesicles')
    and status = 'active' and tag_has_prose(description, short_description);
  if v_bad <> 9 then
    raise exception 'only % of the 9 twin rows are active with prose', v_bad;
  end if;
end
$verify$;

commit;
