-- No tag keeps publishing a bulk-import stamp at an indexable URL.
--
-- THE CLASS
--
-- 137 active tags carry one of four import stamps where their definition should
-- be — "Sexual activity tag" (63), "Toys tag" (83 corpus-wide), "Philia tag"
-- (24), "Scene safety tag" (12) — and 129 of them are seo_indexable. Nothing
-- could see this: `indexable_without_description` reads 0 because the column is
-- not empty, and `run_tag_thin_page_reindex()` fires only when description AND
-- short_description are both blank. A stamp is worse than a blank. A blank is
-- measurable and gets deindexed automatically; a stamp reads as content, passes
-- every existing check, and publishes "Sexual activity tag" as the lead
-- paragraph of /tags/anal-sex.
--
-- WHAT THIS MIGRATION DOES NOT DO, AND WHY THE SPLIT IS WHERE IT IS
--
-- The plan for this wave said: a tag either gets original sourced prose, or it
-- is deindexed. Applied literally to all 137 that would mean writing 137
-- definitions in a health audit. Reading the list, that is the wrong shape:
-- the overwhelming majority are Kinktionary fetish and toy vocabulary —
-- `algophilia`, `auralism`, `curry-comb`, `dacryphilia`, `spreader-bar` — which
-- belongs to the Kinktionary programme that owns that vocabulary, not to a
-- coverage audit against a sexual-health service. 122 of the 137 have zero
-- usage.
--
-- So the split is by WHO OWNS THE CONCEPT, not by how much prose fits in one
-- migration:
--
--   PART A — seven practices drgay.ch devotes risk pages to, where a stamp at a
--   live indexable URL is actively harmful because the reader arrived looking
--   for risk information. These get real prose and stay indexed.
--
--   PART B — everything else still carrying a stamp is DEINDEXED, not deleted
--   and not deprecated. The tag stays active and keeps working as vocabulary
--   for tagging and search; it simply stops being offered to crawlers as a
--   definition page it does not have. This is the established fallback
--   (`run_tag_thin_page_reindex`, 869 pages) and it self-heals: the moment
--   prose is written, that job re-indexes the page. The list is handed to the
--   Kinktionary programme in the audit doc rather than guessed at here.
--
-- Deindexing is the honest outcome, not the lazy one. The alternative — leaving
-- 129 URLs publishing a four-word stamp — is what the audit found.
--
-- PROSE RULES
--
-- Original, grounded in WHO / CDC / UNAIDS / BASHH. drgay.ch has no open licence
-- — the Impressum names Aids-Hilfe Schweiz and nothing more, so it is all rights
-- reserved by default — and is used ONLY as a signal of WHICH practices this
-- readership needs risk information about.
-- NOT ONE WORD OF THEIR PROSE IS COPIED, paraphrased or translated — their meta
-- descriptions included, those being prose too. Nothing here cites drgay.ch as a
-- source, because none of these claims come from them.
--
-- No dosage, route or combination advice (the saferparty precedent). No Swiss
-- material. Where a practice carries a real risk the text names it plainly and
-- names the mitigation, because a reader on a risk page who is given euphemism
-- has been failed twice.
--
-- `app.actor` is set at top level because `log_unified_tag_change()` raises on a
-- human_reviewed row without it — four of the seven are already human-reviewed.

set local statement_timeout = '300s';

select set_config('app.actor', 'admin:tag-placeholder-prose-20260829', true);

-- ---------------------------------------------------------------------------
-- PART A — the seven that get prose.
-- ---------------------------------------------------------------------------
do $prose$
declare
  r        record;
  v_id     uuid;
  v_n      int := 0;
begin
  for r in
    select * from (values
      (
        'anal-sex',
        'Anal sex — penetration of the anus, most often by a penis, fingers or a toy. It carries the highest per-act HIV risk of any common sexual practice when no prevention is used, and that risk is substantially higher for the receptive partner than the insertive one.',
        'Penetration of the anus by a penis, fingers or a toy.',
'Anal sex means penetration of the anus. The anus has no natural lubrication and its lining is thinner and more fragile than that of the vagina, which is why lubricant is not a comfort preference here but the main way of avoiding the small tears that make infection easier.

Of the sexual practices people commonly ask about, receptive anal sex without prevention carries the highest per-act risk of HIV transmission, and the insertive partner''s risk, while lower, is not negligible. Several things reduce it and they work independently: condoms with a compatible lubricant, pre-exposure prophylaxis taken by the HIV-negative partner, and a partner with HIV having a sustained undetectable viral load on treatment, which means they do not transmit HIV sexually. Any one of these is effective; they are not a ladder that has to be climbed in order.

Other sexually transmitted infections follow different rules. Gonorrhoea, chlamydia, syphilis, herpes and HPV can pass through skin contact or from areas a condom does not cover, so neither PrEP nor an undetectable viral load protects against them — regular testing does the work there.

Oil-based products destroy latex, so water- or silicone-based lubricant goes with latex condoms. Toys are shared only with a fresh condom or after washing, and anything used anally needs a flared base. Pain is a stop signal rather than something to work through, and bleeding that does not settle is worth having looked at.'
      ),
      (
        'rimming',
        'Rimming — oral–anal contact. HIV risk is very low, but it is an efficient route for gut infections and parasites, and for syphilis, herpes and HPV through direct contact.',
        'Oral–anal contact, also called anilingus.',
'Rimming is oral contact with the anus. As a route for HIV it is considered very low risk — there is no efficient way for the virus to pass in this direction — and that fact is often generalised into "rimming is safe", which is where the useful information stops and the problem starts.

What it does transmit well is anything present in the gut. Hepatitis A, shigella, giardia, E. coli and intestinal parasites all pass by the faecal–oral route, and rimming is a direct one. Outbreaks of hepatitis A and of drug-resistant shigella among men who have sex with men have been traced to exactly this, which is why hepatitis A vaccination is recommended for this group in many countries and is the single most effective measure available here. Syphilis, herpes and HPV can also pass through the skin contact involved, none of which a viral load or PrEP affects.

Practical reduction is unglamorous and works: a barrier — a dental dam, or a condom cut open — between mouth and anus; washing beforehand; not moving from anus to mouth or to a partner''s genitals without washing in between. Vaccination against hepatitis A and B is worth asking about if it has not been done. Anal douching before rimming is common but is not a hygiene requirement and is not risk-free — frequent or forceful douching irritates the lining and can make infection easier rather than harder.'
      ),
      (
        'fisting',
        'Fisting — insertion of a hand into the rectum or vagina. HIV transmission risk is low, but the potential for tissue injury is real, and injury is what makes other infections and complications more likely.',
        'Insertion of a hand into the rectum or vagina.',
'Fisting is the insertion of a hand, sometimes the forearm. Direct HIV risk is low; the risks that matter are mechanical, and they are the reason the practice has its own safety vocabulary.

The rectal wall can be torn or, rarely, perforated, and a perforation is a surgical emergency rather than something to wait out. Severe pain, heavy or continuing bleeding, fever, or abdominal pain and rigidity after a session all need urgent medical attention, and the practical obstacle is embarrassment rather than availability — an emergency department needs to know what happened to treat it correctly, and delay is what turns a repairable injury into a dangerous one.

What reduces the risk is unhurried preparation, a great deal of lubricant chosen to last, short trimmed nails with no jewellery, and gloves — which protect both people and make cleaning between partners meaningful. Anything shared without a change of glove carries hepatitis C, which transmits through blood and is the infection most associated with this practice in the literature. Numbing products are specifically a bad idea: pain is the signal that prevents injury, and removing it removes the warning rather than the danger.

Alcohol and drugs work in the same direction by blunting the same signal, which is one reason fisting and chemsex appearing together is a recognised pattern in clinical harm-reduction advice.'
      ),
      (
        'bareback',
        'Bareback — condomless anal sex. Originally a subcultural term from the era when condoms were the only prevention available; it now describes a practice that may or may not involve risk, depending on what other prevention is in use.',
        'Condomless anal sex.',
'Bareback means anal sex without a condom. The word carries history: it was coined when condoms were effectively the only means of preventing HIV, so going without them meant accepting the risk, and the term still carries that connotation for many people.

That is no longer what it describes on its own. Condomless sex where the HIV-negative partner takes pre-exposure prophylaxis, or where the partner with HIV has a sustained undetectable viral load, does not carry meaningful HIV risk. Condomless sex with neither in place does. The word covers both, which is why it says little by itself and why clinical services tend to ask what prevention is being used rather than whether a condom was involved.

What the absence of a condom does change in every case is other sexually transmitted infections. Gonorrhoea, chlamydia and syphilis are not affected by PrEP or by an undetectable viral load, and their rates are measurably higher among people having condomless sex — which is why regular testing, typically every three to six months and more often with more partners, is the part of the picture that condomless sex actually removes. Vaccination against hepatitis A and B and against mpox covers several of the rest.

Deciding this in advance, sober, with a partner, is a different conversation from deciding it in the moment, and it is the one worth having.'
      ),
      (
        'blowjob',
        'Oral sex on a penis. HIV risk is low — appreciably lower than for anal sex — but gonorrhoea, chlamydia, syphilis, herpes and HPV all transmit readily by this route, and throat infections are frequently symptomless.',
        'Oral sex performed on a penis.',
'Oral sex on a penis carries a low risk of HIV transmission. It is not zero, and it rises with ejaculation in the mouth, with bleeding gums, ulcers or recent dental work, and with an untreated infection already present — but compared with anal sex the difference is large, and most people''s practical concern here is not HIV.

It is the other infections. Gonorrhoea and chlamydia establish themselves in the throat easily and usually without symptoms, which is exactly why they persist and spread: someone with a throat infection generally has no reason to suspect it. Syphilis passes through contact with a sore that may be painless and unnoticed, and herpes and HPV pass through skin contact. Throat gonorrhoea is also where much of the antibiotic-resistance problem now sits, so testing that includes a throat swab rather than urine alone is what finds it. Testing sites do not always take throat and rectal samples by default, and asking for them is reasonable.

Condoms remove essentially all of this risk. Where they are not used, not ejaculating in the mouth reduces the HIV component, though it does little for the bacterial infections, which pass by contact. Avoiding brushing or flossing immediately beforehand is a small measure that avoids fresh gum abrasions. Vaccination against HPV and against hepatitis A and B covers several of the remaining routes.'
      ),
      (
        'party-and-play',
        'Party and play — sex under the influence of stimulant drugs, usually crystal methamphetamine, GHB/GBL or mephedrone, often over extended sessions. Also called chemsex or PnP.',
        'Sex under the influence of stimulant drugs, often over extended sessions.',
'Party and play, PnP or chemsex describes sex combined with drugs — most often crystal methamphetamine, GHB or GBL, and mephedrone — typically in sessions that run far longer than sex otherwise would, sometimes across days and with several partners.

The risks compound rather than add. Sessions that continue for a long time mean more partners and more physical wear, and drugs that reduce sensation mean injury goes unnoticed; both make HIV, hepatitis C and other sexually transmitted infections more likely. Where drugs are injected — "slamming" — sharing any equipment transmits HIV and hepatitis C directly and efficiently. Judgement about prevention erodes as a session goes on, so decisions made at the start are the ones that hold.

GHB and GBL deserve separate attention because the gap between a dose that does what is wanted and a dose that causes unconsciousness is narrow, and it narrows further with alcohol. Someone who cannot be roused is a medical emergency and belongs in the recovery position with an ambulance called, not left to sleep it off. Emergency services need to know what was taken in order to treat it, and that information matters more than any worry about the consequences of saying so.

Consent is the other thread. Sex organised around intoxication makes capacity to consent genuinely unclear at times, and agreements about what will happen — and about what is off the table — are worth making before a session rather than during one. Services aimed specifically at this exist in many cities and are used by people who have no wish to stop, as well as by those who do.'
      ),
      (
        'sexting',
        'Sexting — sending sexual messages, images or video. It carries no infection risk and two distinct other ones: loss of control over the material, and the legal position where anyone depicted is under the local age of consent.',
        'Sending sexual messages, images or video.',
'Sexting is the exchange of sexual messages, photographs or video. There is no infection risk. The risks are that the material outlives the moment, and that in some circumstances it is illegal.

Anything sent can be screenshotted, saved or forwarded, and disappearing-message features are a courtesy rather than a control. The measures that actually help are about what is in the frame: keeping identifying features — face, tattoos, recognisable rooms — out of images, and knowing who is receiving them. Sharing a private sexual image of someone without their consent is a specific criminal offence in a growing number of jurisdictions, and it is also the mechanism behind sextortion, where material is used as leverage for money or more images. The advice from law enforcement on sextortion is consistent and worth stating plainly: do not pay, do not send more, keep the messages as evidence, and report it.

Consent is the other half and works as it does in person — specific to what was agreed, and revocable. Sending explicit images to someone who has not indicated they want them is not flirting.

Where anyone depicted is below the local age of consent, none of this applies and the material is illegal to create, hold or pass on, including where both people are minors and including where it is of oneself.'
      )
    ) as t(slug, description, short_description, long_description)
  loop
    select id into v_id from public.unified_tags
     where slug = r.slug and status = 'active' and merged_into_id is null;
    if v_id is null then
      raise notice 'prose skip: % not active', r.slug;
      continue;
    end if;

    update public.unified_tags
       set description         = r.description,
           short_description   = r.short_description,
           long_description    = r.long_description,
           human_reviewed      = true,
           verification_status = 'reviewed',
           -- Computed from the prose that now exists, not set blind.
           seo_indexable       = (length(btrim(r.description)) > 60),
           last_verified_at    = now(),
           updated_at          = now()
     where id = v_id;

    v_n := v_n + 1;
  end loop;
  raise notice 'placeholder prose written for % tag(s)', v_n;
end $prose$;

-- ---------------------------------------------------------------------------
-- PART B — deindex every remaining stamp.
--
-- The stamp set is DETECTED with the same shape as the
-- `placeholder_description_active` counter in tag_hygiene_stats() — any
-- description of 40 characters or less shared by more than five tags. Using the
-- same rule in both places is deliberate: a hardcoded list here and a detector
-- there would drift, and the counter would then report a class this migration
-- believed it had cleared.
--
-- Per-row, because trg_search_documents_tag is column-scoped on `description`
-- and `seo_indexable`, so each write enqueues a reindex. That is an append into
-- search_reindex_queue since the P1 overhaul, drained every minute — ~129 rows
-- is well inside one cycle.
-- ---------------------------------------------------------------------------
do $deindex$
declare
  r     record;
  v_n   int := 0;
begin
  for r in
    with stamps as (
      select btrim(description) as d
        from public.unified_tags
       where description is not null
         and length(btrim(description)) between 1 and 40
       group by 1
      having count(*) > 5
    )
    select u.id, u.slug
      from public.unified_tags u
     where u.status = 'active'
       and u.merged_into_id is null
       and u.seo_indexable
       and btrim(u.description) in (select d from stamps)
     order by u.slug
  loop
    update public.unified_tags
       set seo_indexable = false,
           updated_at    = now()
     where id = r.id and seo_indexable;
    if found then v_n := v_n + 1; end if;
  end loop;
  raise notice 'deindexed % placeholder page(s)', v_n;
end $deindex$;

-- ---------------------------------------------------------------------------
-- Verify — only what this migration changed.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad text;
  v_n   int;
begin
  -- The seven have real prose, are human-reviewed, and are indexable.
  select string_agg(s, ', ') into v_bad
  from unnest(array['anal-sex','rimming','fisting','bareback','blowjob',
                    'party-and-play','sexting']) s
  where not exists (
    select 1 from public.unified_tags u
     where u.slug = s and u.status = 'active' and u.merged_into_id is null
       and u.human_reviewed and u.verification_status in ('reviewed','locked')
       and u.seo_indexable
       and length(btrim(u.description)) > 60
       and length(btrim(u.long_description)) > 400);
  if v_bad is not null then
    raise exception 'placeholder prose: not published for: %', v_bad;
  end if;

  -- Not one of them still carries a stamp. Stated as the OLD strings in full —
  -- matching a fragment would trip on prose that legitimately contains the
  -- words "sexual activity".
  select string_agg(slug, ', ') into v_bad
  from public.unified_tags
  where slug in ('anal-sex','rimming','fisting','bareback','blowjob',
                 'party-and-play','sexting')
    and btrim(description) in
        ('Toys tag','Sexual activity tag','Philia tag','Scene safety tag');
  if v_bad is not null then
    raise exception 'placeholder prose: stamp survived on: %', v_bad;
  end if;

  -- Corpus-wide: no active tag publishes a stamp at an indexable URL any more.
  -- This is the whole point of the migration, so it is asserted at zero.
  with stamps as (
    select btrim(description) as d
      from public.unified_tags
     where description is not null
       and length(btrim(description)) between 1 and 40
     group by 1
    having count(*) > 5
  )
  select count(*) into v_n
    from public.unified_tags u
   where u.status = 'active'
     and u.merged_into_id is null
     and u.seo_indexable
     and btrim(u.description) in (select d from stamps);
  if v_n > 0 then
    raise exception 'placeholder prose: % stamp(s) still indexable', v_n;
  end if;

  -- Deindexing must not have deprecated anything. The tags stay usable as
  -- vocabulary; only their crawler exposure changed.
  select count(*) into v_n from public.unified_tags
   where status <> 'active'
     and updated_at > now() - interval '5 minutes'
     and btrim(description) in
         ('Toys tag','Sexual activity tag','Philia tag','Scene safety tag');
  if v_n > 0 then
    raise exception 'placeholder prose: % tag(s) were deactivated, not just deindexed', v_n;
  end if;
end $verify$;
