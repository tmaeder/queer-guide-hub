-- German and scene names as searchable aliases, the two substances the
-- handbook profiles that we had no row for, and 81 food tags filed as drugs.
--
-- WHY THE ALIASES ARE ALL review_status = 'auto'
--
-- This is the load-bearing decision in the file. Since 20260910151200,
-- run_tag_assignment_reconcile() builds its free-text lookup from
-- lower(name) | lower(slug) | lower(alias_name) and trusts only APPROVED
-- aliases — so an approved alias IS an unconditional auto-tagging rule.
--
-- The scene vocabulary is made almost entirely of ordinary words. "Pilze" is
-- German for mushrooms — a food. "Gras" is grass, "Schnee" is snow, "Trüffel"
-- is truffles, "Blüten" is blossoms, "Eis"/"Ice" is ice, "Pappen" is cardboard,
-- "Filze" is felt. In English the same problem: Speed, Pot, Dope, Rush, Crack,
-- Acid, Liquid, Tabs, Blotter, Buds, Cola, Emma, Peter, Kitty. Approving any of
-- these would reproduce the `culture -> Crops` incident (2,609 mis-tagged
-- articles) in two languages at once — a recipe article mentioning Pilze would
-- be tagged as a psychedelic.
--
-- 'auto' still does the job that matters. tag_alias_sync_search_synonym is an
-- AFTER INSERT trigger with NO filter on review_status, so every row below
-- reaches search_synonyms and a German query resolves. The alias is recorded,
-- searchable and visible in TagAliasesDisplay; it is simply never treated as a
-- tagging rule. Recorded, resolvable, never trusted — the same disposition
-- 20260816105401 gave `rack`.
--
-- CORRECTION (2026-08-29, measured on prod). The paragraph above is half wrong,
-- and the wrong half is the load-bearing one. The trigger does fire and does
-- write search_synonyms with no review_status filter — that part is right. But
-- it writes `status='approved'`, and the query-expansion layer reads only
-- `status=eq.active` (workers/search-proxy/src/pgSynonyms.ts). 20260429100000
-- chose that gap deliberately: "Status is 'approved' (not 'active') by design
-- ... NOT projected ... until an admin explicitly activates them." So a German
-- query did NOT resolve. Of nine terms tried against prod after this shipped,
-- only two returned their tag and both by trigram luck ("Naloxon" is one letter
-- from "naloxone"); Lachgas, Koks, Pilze, Mischkonsum, Hitzschlag, Feinwaage
-- and Drogennotfall all returned unrelated fuzzy matches.
--
-- The mistake was verifying the MECHANISM (does the trigger filter on
-- review_status?) and never the OUTCOME (does a German query find the tag?).
-- 20261006150000 activates the unambiguous subset and says why the ordinary
-- words must stay inactive.
--
-- SHORT ALIASES ARE DROPPED ENTIRELY
--
-- The handbook lists "K", "G", "H", "Mo", "C" as scene names. Even as search
-- synonyms these are noise — a one- or two-character token matches everywhere
-- and helps nobody find anything. Anything under three characters is skipped.
--
-- tag_alias_reject_shadow RAISES rather than conflicting, so each insert is
-- individually guarded; ON CONFLICT alone would not catch it. Skips are
-- counted and reported instead of failing the migration, because an alias
-- colliding with a live tag's slug is a legitimate outcome, not an error.
--
-- TWO SUBSTANCES THE HANDBOOK PROFILES AND WE DID NOT HAVE
--
-- `deliriants` and `bromazepam`, both with full profiles in the source and no
-- row here. Deliriants matter disproportionately: they are the clearest
-- counterexample to "natural is safer" — nightshades growing in hedgerows that
-- have killed people through complete loss of contact with reality — and the
-- glossary carried `diphenhydramine` (one member) with no class to hang it on.
--
-- Deliberately NOT added: THC, CBD and citalopram. The handbook profiles them
-- separately, but `cannabis`/`cannabinoids` and `ssris` already cover them
-- here, and splitting a well-populated tag to mirror someone else's table of
-- contents makes the glossary worse, not better.
--
-- 81 FOOD TAGS FILED UNDER SUBSTANCES & HARM REDUCTION
--
-- avocado, waffles, grits, patty-melt, elotes, tartines, chocolate-fondue,
-- wisdom-teeth and 73 more. This is smaller than it looks and the migration
-- says so: ALL 81 are already status='deprecated', so no reader has ever seen
-- one. It is an admin-count and tag_category_assignments defect, not a live
-- bug, and it is fixed here because it distorts every count taken over the
-- category — including the ones used to judge this work.
--
-- There is no food category among the 48 in tag_categories, so the fix is to
-- REMOVE the wrong assignment, not to invent a taxonomy branch for tags nobody
-- can see. The rows keep their prose and their deprecated status.
--
-- The denormalized unified_tags.category must be cleared explicitly:
-- sync_tag_category_assignment only writes it when the NEW category_id is NOT
-- NULL, so setting category_id = null on its own would leave the text behind
-- and the tags would still count as substances everywhere the text is read.

set local statement_timeout = '600s';

do $mig$
declare
  v_cat_id   uuid;
  v_tag_id   uuid;
  v_parent   uuid;
  v_skipped  int := 0;
  v_added    int := 0;
  v_n        int;
  r          record;
begin
  perform set_config('app.actor', 'admin:substanzhandbuch-aliases', true);

  select id into strict v_cat_id
    from public.tag_categories where slug = 'substances-harm-reduction';

  ---------------------------------------------------------------------------
  -- 1. The two missing substances.
  ---------------------------------------------------------------------------
  create temp table _new (
    slug text primary key, name text not null, descr text not null, longdescr text
  ) on commit drop;

  insert into _new (slug, name, descr, longdescr) values
  ('deliriants', 'Deliriants',
   'A class of drugs that produce true delirium — hallucinations indistinguishable from reality, with no insight that anything has been taken. Mostly plants, and among the most dangerous substances there are.',
   'Deliriants are the third branch of the hallucinogens, alongside psychedelics and dissociatives, and they behave nothing like either. Where a psychedelic distorts perception in a way the person can usually still recognise as drug-induced, a deliriant removes that recognition entirely. Hallucinations are seamless and are acted on as real — holding conversations with people who are not there, walking into traffic, into water.

Most are plants: nightshade, datura, angel''s trumpet and related species, whose active compounds are atropine and scopolamine. Some antihistamines produce the same effect at high amounts. The fact that several grow wild is exactly why they are worth a page — they are freely available and widely underestimated.

They are the clearest refutation of the idea that natural means safer. Fatal accidents are common, and they usually happen through the loss of reality contact rather than through direct toxicity. Potency varies enormously between plants, parts of the same plant, and seasons, so no amount is predictable.

Experiences are overwhelmingly reported as unpleasant, and there is little of the recreational following the other hallucinogens have. Unlike most of this field, deliriant poisoning does have a medical antidote, and it is a hospital emergency: anyone in this state cannot look after themselves and may need physically restraining for their own safety.'),
  ('bromazepam', 'Bromazepam',
   'A medium-acting benzodiazepine prescribed for anxiety, sold under names including Lexotanil. Counterfeit blisters are common and indistinguishable from genuine ones.',
   'Bromazepam is a benzodiazepine used for anxiety, marketed as Lexotanil in Switzerland and Austria and under several names in Germany. It carries the risks of the class: dependence with regular use, memory gaps, disinhibition, and a withdrawal that can be dangerous rather than merely unpleasant.

Two things distinguish it in practice. Its relatively long duration makes it a poor choice as an emergency anxiety brake during a difficult psychedelic experience, because the sedation substantially outlasts the trip. And when combined with a stimulant, the stimulant''s onset can be delayed by hours — long enough that people take more, then meet both effects at once.

Material bought outside a pharmacy is a particular problem for this class. Counterfeit blisters are visually identical to genuine packaging, and what is in them varies; testing is the only way to know.

As with all benzodiazepines, stopping abruptly after sustained use can produce seizures and delirium tremens. Reduction needs to be planned, and supervised where dependence is established.');

  for r in select * from _new order by slug loop
    insert into public.unified_tags (
      name, slug, entity_kind, status, description, short_description,
      long_description, is_sensitive, sensitive_topics, verification_status,
      human_reviewed, seo_indexable, last_verified_at
    ) values (
      r.name, r.slug, 'concept', 'active', r.descr,
      split_part(r.descr, '. ', 1) || '.', r.longdescr,
      true, array['substance use','harm reduction'], 'reviewed', true, true, now()
    )
    on conflict (slug) do update set
      name = excluded.name, status = 'active',
      description = excluded.description,
      short_description = excluded.short_description,
      long_description = excluded.long_description,
      is_sensitive = true, sensitive_topics = excluded.sensitive_topics,
      verification_status = 'reviewed', human_reviewed = true, seo_indexable = true,
      merged_into_id = null, deprecated_at = null, deprecation_reason = null,
      last_verified_at = now(), updated_at = now();
  end loop;

  for r in select * from _new order by slug loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    continue when v_tag_id is null;
    update public.tag_category_assignments set is_primary = false
     where tag_id = v_tag_id and category_id <> v_cat_id;
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (v_tag_id, v_cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
    update public.unified_tags set category_id = v_cat_id, updated_at = now()
     where id = v_tag_id and category_id is distinct from v_cat_id;
  end loop;

  -- diphenhydramine finally has a class to sit under.
  select id into v_tag_id from public.unified_tags where slug = 'diphenhydramine';
  select id into v_parent from public.unified_tags where slug = 'deliriants';
  if v_tag_id is not null and v_parent is not null and v_tag_id <> v_parent then
    insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
    values (v_tag_id, v_parent, 'broader', 1.0, 'approved')
    on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
  end if;

  ---------------------------------------------------------------------------
  -- 2. German and scene aliases. ALL 'auto' — see header.
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('nitrous-oxide','Sahnekapseln','multilingual'),
      ('nitrous-oxide','Sahnepatronen','multilingual'),
      ('nitrous-oxide','Ballon','multilingual'),
      ('methamphetamine','Pervitin','brand_name'),
      ('methamphetamine','Shabu','synonym'),
      ('methamphetamine','Yaba','synonym'),
      ('methamphetamine','Ice','synonym'),
      ('cocaine','Koks','multilingual'),
      ('cocaine','Schnee','multilingual'),
      ('cocaine','Freebase','synonym'),
      ('amphetamine','Speed','synonym'),
      ('amphetamine','Pep','synonym'),
      ('amphetamine','Amphi','multilingual'),
      ('cannabis','Gras','multilingual'),
      ('cannabis','Hasch','multilingual'),
      ('cannabis','Ganja','synonym'),
      ('cannabis','Blüten','multilingual'),
      ('psilocybin','Psilos','multilingual'),
      ('psilocybin','Pilze','multilingual'),
      ('psilocybin','Zauberpilze','multilingual'),
      ('psilocybin','Trüffel','multilingual'),
      ('lsd','Acid','synonym'),
      ('lsd','Pappen','multilingual'),
      ('lsd','Filze','multilingual'),
      ('lsd','Löschpapier','multilingual'),
      ('lsd','Blotter','synonym'),
      ('mdma','Emma','synonym'),
      ('mdma','Pillen','multilingual'),
      ('heroin','Hero','synonym'),
      ('heroin','Shore','multilingual'),
      ('heroin','Diaphin','brand_name'),
      ('ketamine','Keti','multilingual'),
      ('ketamine','Ket','synonym'),
      ('ketamine','Vitamin K','synonym'),
      ('ghb','Liquid Ecstasy','synonym'),
      ('ghb','K.-o.-Tropfen','multilingual'),
      ('alcohol','Ethanol','synonym'),
      ('alcohol','Alk','multilingual'),
      ('tilidine','Valoron','brand_name'),
      ('tilidine','Tillis','multilingual'),
      ('tramadol','Tramal','brand_name'),
      ('oxycodone','Oxy','abbreviation'),
      ('morphine','MST','brand_name'),
      ('alprazolam','Xanax','brand_name'),
      ('alprazolam','Xani','multilingual'),
      ('diazepam','Dias','multilingual'),
      ('lorazepam','Temesta','brand_name'),
      ('lorazepam','Tavor','brand_name'),
      ('midazolam','Dormicum','brand_name'),
      ('bromazepam','Lexotanil','brand_name'),
      ('bromazepam','Bromazanil','brand_name'),
      ('codeine','Lean','synonym'),
      ('codeine','Purple Drank','synonym'),
      ('codeine','Sizzurp','synonym'),
      ('codeine','Makatussin','brand_name'),
      ('kratom','Ketum','synonym'),
      ('kratom','Mitragynin','synonym'),
      ('poppers','Alkylnitrite','multilingual'),
      ('poppers','Amylnitrit','multilingual'),
      ('poppers','Isopropylnitrit','multilingual'),
      ('3-mmc','Metaphedrone','synonym'),
      ('mephedrone','Meow','synonym'),
      ('mephedrone','M-Cat','synonym'),
      ('mephedrone','Mephedron','multilingual'),
      ('salvia-divinorum','Salvinorin A','synonym'),
      ('benzodiazepines','Benzodiazepine','multilingual'),
      ('benzodiazepines','Benzos','abbreviation'),
      ('maois','MAO-Hemmer','multilingual'),
      ('dissociatives','Dissoziativa','multilingual'),
      ('psychedelics','Psychedelika','multilingual'),
      ('stimulants','Stimulanzien','multilingual'),
      ('opioids','Opioide','multilingual'),
      ('depressants','Downer','synonym'),
      ('synthetic-cannabinoids','Kräutermischung','multilingual'),
      ('deliriants','Delirantia','multilingual'),
      ('deliriants','Nachtschattengewächse','multilingual'),
      ('deliriants','Tollkirsche','multilingual'),
      ('deliriants','Stechapfel','multilingual'),
      ('deliriants','Engelstrompete','multilingual'),
      ('deliriants','Scopolamin','synonym'),
      ('drug-checking','Drogenanalyse','multilingual'),
      ('safer-use','Safer Use Regeln','multilingual'),
      ('harm-reduction','Schadensminderung','multilingual'),
      ('withdrawal','Entzug','multilingual'),
      ('overdose','Überdosis','multilingual'),
      ('trip-sitter','Tripsitting','synonym'),
      ('bad-trip','Horrortrip','multilingual'),
      ('safer-injecting','Safer Use beim Spritzen','multilingual'),
      ('safer-sniffing','Safer Sniffing Regeln','multilingual'),
      ('polydrug-use','Mischkonsum','multilingual'),
      ('drug-tolerance','Toleranz','multilingual'),
      ('ego-dissolution','Ego-Tod','multilingual'),
      ('ego-dissolution','Ich-Auflösung','multilingual'),
      ('delirium-tremens','Entzugsdelir','multilingual'),
      ('recovery-position','Stabile Seitenlage','multilingual'),
      ('cpr','Reanimation','multilingual'),
      ('heatstroke','Hitzschlag','multilingual'),
      ('seizure','Krampfanfall','multilingual'),
      ('circulatory-collapse','Kreislaufkollaps','multilingual'),
      ('drug-emergency','Drogennotfall','multilingual'),
      ('volumetric-dosing','Volumetrisches Dosieren','multilingual'),
      ('milligram-scale','Feinwaage','multilingual'),
      ('reagent-testing','Reagenztest','multilingual'),
      ('naloxone','Naloxon','multilingual'),
      ('antidote','Antidot','multilingual'),
      ('antidote','Gegenmittel','multilingual'),
      ('half-life','Halbwertszeit','multilingual'),
      ('bioavailability','Bioverfügbarkeit','multilingual'),
      ('gaba','Gamma-Aminobuttersäure','multilingual')
    ) as t(slug, alias, atype)
  loop
    -- Short tokens are noise even as search synonyms (see header).
    continue when length(r.alias) < 3;

    select id into v_tag_id from public.unified_tags where slug = r.slug;
    continue when v_tag_id is null;

    begin
      insert into public.tag_aliases
        (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
      values
        (v_tag_id, r.alias, public.normalize_tag_slug(r.alias), r.atype, 'auto')
      on conflict (alias_slug) do nothing;
      -- ON CONFLICT DO NOTHING leaves FOUND false, so this counts rows actually
      -- written rather than rows attempted.
      if found then v_added := v_added + 1; end if;
    exception when others then
      v_skipped := v_skipped + 1;
      raise notice 'alias % -> % skipped: %', r.alias, r.slug, sqlerrm;
    end;
  end loop;

  ---------------------------------------------------------------------------
  -- 3. Unfile the food. All 81 are already deprecated; see header.
  ---------------------------------------------------------------------------
  for r in
    select unnest(array[
      'applesauce','avocado','bay','beef-tartare','beef-tongue','belgian',
      'big-portions','broccoli','caesar-salad','cashews','cheese','cherry-sauce',
      'chevre','chicken-tamales','chocolate-fondue','cole-slaw','confit',
      'coriander','cranberries','creamy-mushrooms','creme-brulee','curry-sauce',
      'danishes','eggplant','eggs','elotes','french-toast','fresh-ginger',
      'fresh-lime-juice','fried-zucchini','frijoles','gambas','garlic',
      'gastronomy','green-peppers','green-sauce','grits','guava','hot-cheese',
      'hot-potatoes','insalata','jams','lollipops','mackerel','maigre','maple',
      'menudo','mint','mozzarella','mustard','nuts','oat-milk','orange-juice',
      'patty-melt','picante','pistachios','porchetta','potato-chips',
      'pretzels-and-sausage','pudding','red-onions','rillettes','roasted-chicken',
      'roasted-garlic','scrambled-eggs','sea-salt','seasonal-fruits',
      'sesame-seeds','skewers','sour-cherries','spicy-dogs','tangerine',
      'tartines','tasting-menu','tuna-toasts','vanilla-yogurt','waffles',
      'white-chocolate','wild-boar-sloppy-joe','wisdom-teeth','yams'
    ]) as slug
  loop
    select id into v_tag_id from public.unified_tags
     where slug = r.slug and status = 'deprecated';
    -- Only ever touches a deprecated row. A food slug that somehow went live
    -- again is left alone and shows up in the assertion below instead.
    continue when v_tag_id is null;

    delete from public.tag_category_assignments
     where tag_id = v_tag_id and category_id = v_cat_id;

    update public.unified_tags
       set category_id = null, category = null, updated_at = now()
     where id = v_tag_id and category_id = v_cat_id;
  end loop;

  ---------------------------------------------------------------------------
  -- 4. Assertions.
  ---------------------------------------------------------------------------
  select count(*) into v_n
    from _new n left join public.unified_tags t on t.slug = n.slug
   where t.id is null or t.status <> 'active' or t.human_reviewed is not true;
  if v_n > 0 then
    raise exception 'aliases/hygiene: % new substance(s) missing or not publishable', v_n;
  end if;

  -- THE rule of this file: no ordinary-word alias may be an auto-tagging rule.
  select count(*) into v_n
    from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where t.category = 'Substances & Harm Reduction'
     and a.review_status = 'approved'
     and lower(a.alias_name) in (
       'pilze','gras','schnee','trüffel','blüten','pappen','filze','speed',
       'pep','acid','blotter','ice','koks','emma','pillen','ballon','oxy',
       'lean','meow','downer','benzos','alk','hero','shore','ket','keti',
       'toleranz','entzug','mischkonsum'
     );
  if v_n > 0 then
    raise exception 'aliases/hygiene: % ordinary-word alias(es) are approved and therefore auto-tagging rules', v_n;
  end if;

  -- Nothing under three characters should have been written.
  select count(*) into v_n
    from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where t.category = 'Substances & Harm Reduction' and length(a.alias_name) < 3;
  if v_n > 0 then
    raise exception 'aliases/hygiene: % alias(es) shorter than 3 characters', v_n;
  end if;

  -- The food must be out of the category, and must still exist.
  select count(*) into v_n
    from public.unified_tags
   where category = 'Substances & Harm Reduction'
     and slug in ('avocado','waffles','grits','patty-melt','elotes','tartines',
                  'chocolate-fondue','wisdom-teeth','mozzarella','guava');
  if v_n > 0 then
    raise exception 'aliases/hygiene: % food tag(s) still filed as substances', v_n;
  end if;

  select count(*) into v_n
    from public.unified_tags
   where slug in ('avocado','waffles','grits','mozzarella')
     and (status = 'merged' or merged_into_id is not null);
  if v_n > 0 then
    raise exception 'aliases/hygiene: % food tag(s) were merged rather than unfiled', v_n;
  end if;

  raise notice 'aliases/hygiene: 2 substances added, % aliases written, % skipped, food unfiled',
    v_added, v_skipped;
end
$mig$;

select public.recount_all_tag_usage(500);
