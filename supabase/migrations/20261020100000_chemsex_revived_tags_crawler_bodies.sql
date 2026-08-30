-- The four tags revived by 20261016100000 publish an encyclopaedia stub to crawlers.
--
-- That migration gave each of them source-grounded prose in `description`. But
-- `functions/_lib/detail.ts` renders `long_description ?? description ?? short_description`,
-- and all four kept the `long_description` they were given by the 2026-04-27 bulk sweep
-- while they sat deprecated. So the reader sees the chemsex-grounded text and Google sees
-- the stub — measured on prod after the deploy:
--
--   /tags/drug-induced-psychosis  "Substance-induced psychosis is a form of psychosis
--                                  attributed to substance intoxication, withdrawal…"
--   /tags/k-hole                  "A K-hole is a transient dissociative state experienced
--                                  during ketamine intoxication…"
--   /tags/cathinones              "Cathinones are a class of synthetic stimulants that are
--                                  chemically similar to cathinone…"
--   /tags/chillout-room           "A chillout room is a quiet space where individuals can
--                                  relax and unwind…"
--
-- None of that is wrong. All of it is generic: no chemsex context, no harm-reduction
-- content, and — on the two clinical ones — none of the guidance that is the entire
-- reason the sources cover them. `drug-induced-psychosis` gets two pages of the First Aid
-- sheet, and its crawler body says nothing about meth, cathinones, missed sleep, or what
-- to actually do.
--
-- 20261016100000 fixed exactly this class for /tags/ghb and /tags/mephedrone and missed
-- it for these four, because those two were edits to live pages and these were revivals —
-- the revival path never asked what the crawler would end up rendering.
--
-- APPENDS, not rewrites. The encyclopaedic paragraph is accurate and stays; what the
-- sources add goes after it. Each write is guarded on its own fingerprint so a re-run
-- cannot double-append, and Part 2 asserts every one landed — a guarded no-op reads
-- exactly like success otherwise, which is how the first version of this pass shipped a
-- `replace()` whose anchor had moved.
--
-- SOURCES (as 20261016100000)
--   [AAE] Poulios, A. (2023) "Harm reduction in the context of chemsex: training manual".
--   [FA]  Stuart, D. & Labayen De Inza, I. (2018) "Chemsex First Aid action sheet".

select set_config('app.actor', 'editorial:chemsex-harm-reduction-source-pass-2026', false);

-- ---------------------------------------------------------------------------
-- Part 1. Append the chemsex-grounded half to each crawler-visible body.
-- ---------------------------------------------------------------------------

-- [FA pp10-11] gives the symptom script and, more importantly, the response: lower the
-- stimulation rather than argue with what the person is seeing.
update unified_tags set
  long_description = long_description ||
    E'\n\nIn a chemsex context it is stimulants plus missed sleep that bring this on — most often crystal meth or cathinones after a night or more awake. It runs to a recognisable script: hidden cameras, someone listening at the door, insects under the skin, being deliberately infected, cruel voices. It is far more likely where a person already feels judged or unsafe, and more likely again when the drug has been injected.\n\nThe useful response is to lower the stimulation, not to argue with what they are seeing: lights down, music and porn off, a quieter room, and real choices rather than a feeling of being trapped. Telling someone they are hallucinating does not help. It becomes an emergency when their distress puts them or anyone else in danger, and then it is emergency services.'
where slug = 'drug-induced-psychosis'
  and long_description is not null
  and long_description not like '%lower the stimulation%';

-- [AAE 3.4.4] and [FA]: consent is the part a clinical definition leaves out.
update unified_tags set
  long_description = long_description ||
    E'\n\nIt usually passes on its own and leaves nothing worse than disorientation. What it does leave is someone who cannot move, cannot speak, and cannot consent to anything — and who cannot get themselves away from harm. Anyone in one needs to be kept safe and watched, not left with strangers.\n\nMove them somewhere quiet and out of bright light. If it runs much past ninety minutes, or if their breathing is laboured at any point, call an ambulance. There is no antidote to ketamine, so time and observation are the whole of the treatment.'
where slug = 'k-hole'
  and long_description is not null
  and long_description not like '%cannot consent to anything%';

-- [FA p13] verbatim on the vascular risk; [AAE 3.3.4] on redosing and the ban ladder.
update unified_tags set
  long_description = long_description ||
    E'\n\nThis is the family most chemsex stimulants come from, sold as a rolling series of near-identical powders as each one is banned in turn — mephedrone, then 3-MMC, then 4-CMC and their successors. The high is short, which pulls people into redosing through a session, and doses stack faster than the comedown suggests.\n\nThey also constrict blood vessels and promote clotting, and heart attacks happen on them. Chest pain or tightness lasting more than a few minutes is an emergency, not a panic attack to breathe through, and a pre-existing heart condition is a reason to avoid them entirely.'
where slug = 'cathinones'
  and long_description is not null
  and long_description not like '%rolling series of near-identical powders%';

-- [AAE 4.1.2] "Making the venue safe": the chillout room is something a host sets up in
-- advance, alongside water and snacks in sight.
update unified_tags set
  long_description = long_description ||
    E'\n\nAt a chemsex party or a sauna it is a specific piece of harm reduction rather than a general amenity: a room where nothing is expected of anyone — no sex, no dosing, lower light and sound. Harm-reduction guidance treats it as something the host sets up in advance, along with water and snacks left in plain sight, because the moment somebody needs one is the moment nobody present is in a state to improvise it.'
where slug = 'chillout-room'
  and long_description is not null
  and long_description not like '%nothing is expected of anyone%';

-- ---------------------------------------------------------------------------
-- Part 2. Assertions.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(v.slug, ', ' order by v.slug) into v_missing
  from (values
    ('drug-induced-psychosis', '%lower the stimulation%'),
    ('k-hole',                 '%cannot consent to anything%'),
    ('cathinones',             '%rolling series of near-identical powders%'),
    ('chillout-room',          '%nothing is expected of anyone%')
  ) as v(slug, fingerprint)
  where not exists (
    select 1 from unified_tags t
     where t.slug = v.slug and t.status = 'active'
       and t.long_description like v.fingerprint);

  if v_missing is not null then
    raise exception 'chemsex revived bodies: the append did not land on %', v_missing;
  end if;

  -- The append must not have displaced the original text. Each of these is a phrase from
  -- the encyclopaedic paragraph that was already there; losing one means this migration
  -- overwrote a body instead of extending it.
  select string_agg(v.slug, ', ' order by v.slug) into v_missing
  from (values
    ('drug-induced-psychosis', '%psychosis%'),
    ('k-hole',                 '%dissociative%'),
    ('cathinones',             '%synthetic stimulants%'),
    ('chillout-room',          '%relax%')
  ) as v(slug, fingerprint)
  where not exists (
    select 1 from unified_tags t
     where t.slug = v.slug and t.long_description like v.fingerprint);

  if v_missing is not null then
    raise exception 'chemsex revived bodies: the original text was lost on %', v_missing;
  end if;
end $$;
