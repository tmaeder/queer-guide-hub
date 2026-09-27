-- Seventeen WebMD sex and relationship articles compared with the final
-- migrated glossary state. This is a concept audit, not an article import.
--
-- ALREADY STRONGER THAN THE SUPPLIED SOURCE, LEFT ALONE:
--   * penis, vagina, clitoris, ovaries, fallopian-tubes, egg and the other
--     anatomy rows already use anatomy-first language rather than assigning
--     organs to a gender;
--   * masturbation already states that it is ordinary, self-directed sexual
--     activity and distinguishes solo from mutual activity;
--   * sildenafil, tadalafil, vardenafil and avanafil already carry label-level
--     nitrate/nitrite warnings and drug-specific timing rather than WebMD's
--     flattened family summary;
--   * erection already covers both penile and clitoral erectile tissue;
--   * sperm and semen were already separated, and the wrong Indonesian
--     namesake prose on semen was removed.
--
-- IMPROVED HERE:
--   * testicle gains the two pieces a thin anatomy definition did not carry:
--     sudden severe pain is an emergency, while evidence does not support a
--     monthly self-exam recommendation for everyone;
--   * erectile-dysfunction gains a body covering evaluation, communication and
--     treatment without treating an erection as a measure of desire;
--   * sperm gains the cell/fluid distinction and what a semen analysis measures;
--   * STI loses "safe sex practices", which the published UNAIDS-derived
--     styleguide explicitly rejects, and names the actual prevention tools.
--
-- CREATED AS CANONICAL CONCEPTS:
--   sexual-response-cycle, refractory-period, vulval-self-exam,
--   fear-of-intimacy, fear-of-commitment, possessiveness, pde5-inhibitor.
-- `Vaginal self-exam` is an alias of vulval-self-exam because most of what a
-- person can inspect is the vulva; `commitment phobia` routes to the descriptive
-- and non-diagnostic headword fear-of-commitment.
--
-- DELIBERATELY NOT CREATED:
--   sex-and-health                 broad listicle, not a glossary concept
--   male/female-reproductive-system umbrella pages duplicate the anatomy graph
--   risky-sex                     labels people/whole acts instead of naming
--                                  route, act and protection
--
-- WebMD is retained as the supplied editorial source. Consequential claims are
-- paired with Cleveland Clinic, ACOG, ACS, CDC, APA, DailyMed or the National
-- Domestic Violence Hotline. New pages are active for site search but remain
-- non-indexable until the existing publication-readiness process approves them.

begin;

select set_config('app.actor', 'migration:99991790276000_webmd_glossary', true);

create temporary table _webmd_new (
  slug text primary key,
  name text not null,
  category_slug text not null,
  description text not null,
  short_description text not null,
  long_description text not null,
  is_sensitive boolean not null default false,
  sensitive_topics text[] not null default '{}'
) on commit drop;

insert into _webmd_new (
  slug, name, category_slug, description, short_description, long_description,
  is_sensitive, sensitive_topics
) values
(
  'sexual-response-cycle',
  'Sexual Response Cycle',
  'sexual-health',
  'A model for the physical and emotional changes that can happen during sexual activity: desire or excitement, arousal, orgasm and resolution. It is a map, not a required sequence.',
  'A flexible model of desire, arousal, orgasm and resolution.',
  'The sexual response cycle is a model for changes in the body and emotions during sexual activity, including masturbation. One common version names desire or excitement, arousal, orgasm and resolution.

People do not have to pass through every stage, in that order, or at the same pace as a partner. Desire can follow arousal, phases can overlap, and satisfying sex does not require orgasm. The model is useful for describing a response or locating a difficulty; it is not a standard a body has to meet.',
  false,
  '{}'
),
(
  'refractory-period',
  'Refractory Period',
  'sexual-health',
  'The recovery period after orgasm when sexual response is reduced and another erection or orgasm may be difficult or impossible for a while. Its length varies widely.',
  'Temporary recovery after orgasm before the body responds as strongly again.',
  'A refractory period is the time after orgasm when the body responds less readily to more stimulation. Another erection or orgasm may be difficult or impossible for a while, particularly after penile ejaculation, but the length varies between people and from one occasion to another.

It is not a measure of attraction or willingness. Touch, toys and other forms of sex or intimacy remain available if everyone wants them. A new or persistent change in erectile function, pain, or an erection lasting four hours needs medical attention rather than pressure to perform.',
  false,
  '{}'
),
(
  'vulval-self-exam',
  'Vulval Self-Exam',
  'sexual-health',
  'An optional visual and gentle touch check that helps someone learn what is normal for their own vulva and notice a persistent change. It is not a cancer, cervical-screening or STI test.',
  'An optional check to learn what is normal for your vulva and notice changes.',
  'Most of what a person can see with a mirror is the vulva — the labia, clitoris, vaginal opening and surrounding skin — rather than the internal vagina. Color, size, symmetry, discharge and texture vary widely, so the point of a self-exam is familiarity, not comparison with one supposed normal.

A self-exam is optional and does not replace cervical screening, STI testing or an examination prompted by symptoms. A lump, sore, ulcer, new patch of color, persistent itching, unexplained bleeding, unusual discharge or pain that persists or returns should be assessed by a clinician. There is no need to force an internal examination.',
  false,
  '{}'
),
(
  'fear-of-intimacy',
  'Fear of Intimacy',
  'dating-connection',
  'A pattern of wanting closeness while withdrawing from emotional, physical, intellectual or shared-experience intimacy because it feels unsafe or exposing.',
  'Pulling away from closeness because intimacy feels unsafe or exposing.',
  'Fear of intimacy describes difficulty tolerating closeness, not a diagnosis to apply to someone who wants more privacy, less sex or a different kind of relationship. It can appear as keeping relationships superficial, pulling away when trust grows, or alternating between seeking and rejecting closeness.

Attachment history, trauma, anxiety and past relationships can contribute, but behavior alone cannot reveal a cause. Clear boundaries, gradual trust and direct communication help; therapy can help when the pattern causes distress or repeatedly blocks relationships the person wants.',
  false,
  '{}'
),
(
  'fear-of-commitment',
  'Fear of Commitment',
  'dating-connection',
  'Anxiety or uncertainty about becoming bound to a relationship, plan or other long-term course of action. Also called commitment phobia, though it is a description rather than a standalone diagnosis.',
  'Anxiety about committing to a relationship or another long-term course of action.',
  'Fear of commitment can show up as avoiding definitions, resisting future plans or ending relationships as they become more interdependent. It can be connected with fear of losing autonomy, attachment difficulties or earlier experiences, but none of those can be diagnosed from reluctance alone.

Not wanting marriage, exclusivity or a long-term relationship is not a disorder. The practical question is whether people want compatible things and can say so honestly. “Commitment phobia” should not be used to pressure someone past a boundary or to explain a partner without their participation.',
  false,
  '{}'
),
(
  'possessiveness',
  'Possessiveness',
  'dating-connection',
  'Treating a partner as something to monitor, restrict or own. Repeated checking, privacy invasion and isolation are control, not proof of love, and can become abuse.',
  'Monitoring, restricting or isolating a partner under the name of love.',
  'Possessiveness crosses from a feeling into controlling behavior when someone demands constant location updates, searches devices, restricts friendships, controls time or money, or punishes independence. Jealousy may be the explanation offered; it does not make the control acceptable.

Possessive and controlling behavior can intensify gradually and may be part of abuse or stalking. If setting a boundary feels unsafe, prioritize a safety plan and independent support rather than a confrontation or couples counseling. Someone noticing the pattern in their own behavior can take responsibility, stop the monitoring and seek individual help.',
  true,
  array['relationship abuse', 'coercive control']
),
(
  'pde5-inhibitor',
  'PDE5 Inhibitor',
  'sexual-health',
  'A drug class that improves blood flow and makes an erection easier in response to sexual stimulation. Sildenafil, tadalafil, vardenafil and avanafil are examples.',
  'The erectile-dysfunction drug class containing sildenafil, tadalafil, vardenafil and avanafil.',
  'PDE5 inhibitors make an erection easier to get or keep by supporting the blood-flow response to sexual stimulation; they do not create desire or an automatic erection. The drugs differ in onset, duration, dose and interactions, so they are not interchangeable even when their basic mechanism is the same.

Combining any PDE5 inhibitor with nitrate medication or nitrite inhalants such as poppers can cause a dangerous fall in blood pressure. The safe interval is drug-specific and is not established for every product, so the individual medicine page and prescriber instructions matter. An erection lasting four hours is an emergency.',
  true,
  array['sexual health', 'medication safety']
);

-- Define alternate spellings before creating rows so a concept already living
-- under one of them blocks creation rather than becoming a duplicate afterward.
create temporary table _webmd_aliases (
  target_slug text not null,
  alias_name text not null,
  alias_slug text not null,
  alias_type text not null
) on commit drop;

insert into _webmd_aliases values
  ('sexual-response-cycle', 'Human Sexual Response Cycle', 'human-sexual-response-cycle', 'synonym'),
  ('refractory-period', 'Post-orgasm Recovery Period', 'post-orgasm-recovery-period', 'synonym'),
  ('vulval-self-exam', 'Vaginal Self-Exam', 'vaginal-self-exam', 'synonym'),
  ('vulval-self-exam', 'Vulvar Self-Exam', 'vulvar-self-exam', 'spelling_variant'),
  ('fear-of-commitment', 'Commitment Phobia', 'commitment-phobia', 'synonym'),
  ('pde5-inhibitor', 'PDE-5 Inhibitor', 'pde-5-inhibitor', 'spelling_variant');

-- Two umbrella terms may already exist as non-article utility vocabulary in a
-- newer database. Snapshot all four rejected slugs so the postcondition proves
-- this pass neither creates nor replaces them without assuming an old corpus.
create temporary table _webmd_rejected_before (
  slug text primary key,
  id uuid not null
) on commit drop;

insert into _webmd_rejected_before (slug, id)
select slug, id
  from public.unified_tags
 where slug in ('sex-and-health', 'male-reproductive-system',
                'female-reproductive-system', 'risky-sex');

-- INSERT does not fire either category reconciliation trigger. Set the ID and
-- display text on the row, then create the primary junction explicitly.
insert into public.unified_tags (
  name, slug, entity_kind, description, short_description, long_description,
  category_id, category, status, seo_indexable, human_reviewed,
  verification_status, publication_role, is_sensitive, sensitive_topics, usage_count,
  last_verified_at
)
select n.name, n.slug, 'concept', n.description, n.short_description,
       n.long_description, c.id, c.name, 'active', false, true,
       'reviewed', 'article', n.is_sensitive, n.sensitive_topics, 0, now()
  from _webmd_new n
 join public.tag_categories c on c.slug = n.category_slug
 where not exists (select 1 from public.unified_tags t where t.slug = n.slug)
   and not exists (select 1 from public.unified_tags t where lower(btrim(t.name)) = lower(btrim(n.name)))
   and not exists (select 1 from public.tag_aliases a where a.alias_slug = n.slug)
   and not exists (
     select 1 from _webmd_aliases a
     join public.unified_tags t on t.slug = a.alias_slug
      where a.target_slug = n.slug
   )
   and not exists (
     select 1 from _webmd_aliases a
     join public.tag_aliases x on x.alias_slug = a.alias_slug
      where a.target_slug = n.slug
   );

insert into public.tag_category_assignments (tag_id, category_id, is_primary)
select t.id, c.id, true
  from _webmd_new n
  join public.unified_tags t on t.slug = n.slug
  join public.tag_categories c on c.slug = n.category_slug
 where not exists (
   select 1 from public.tag_category_assignments a
    where a.tag_id = t.id and a.category_id = c.id
 )
on conflict (tag_id, category_id) do update set is_primary = true;

-- Existing pages: add the missing layer only while the exact audited state is
-- still present. A later human edit makes these statements no-op.
update public.unified_tags
   set long_description =
'Testicles make sperm and testosterone and are held in the scrotum, which moves them closer to or farther from the body to regulate temperature. It is common for one to be a little larger or hang lower.

A new lump, swelling, heaviness or lasting ache should be checked. Sudden severe pain is different: a twisted testicle can lose its blood supply and needs emergency care. Evidence is not strong enough to recommend a scheduled monthly self-exam for everyone, but knowing what is normal for your own body makes a new change easier to notice.'
 where slug = 'testicle' and status = 'active'
   and description = 'One of the pair of organs that produce sperm and testosterone, held in the scrotum.'
   and long_description is null;

update public.unified_tags
   set long_description =
'Erectile dysfunction can have physical, medication-related, psychological and relationship contributors, often more than one at once. Arousal and erection are not the same thing: difficulty becoming hard does not prove lack of desire, and pressure to perform can make the cycle worse.

A new or persistent change is worth medical review because blood-vessel disease, diabetes, nerve conditions, hormones and medication effects can be involved. Treatment can include addressing the cause, counseling or sex therapy, lifestyle changes, devices, injections or tablets. PDE5-inhibitor tablets must not be combined with nitrate medication or nitrite inhalants such as poppers.'
 where slug = 'erectile-dysfunction' and status = 'active'
   and description = 'Persistent difficulty getting or keeping an erection firm enough for the sex you want to have. Common, treatable, and not limited to any one group — anti-androgens, oestrogen, SSRIs, blood-pressure medication, alcohol, diabetes and anxiety are all ordinary causes. Occasional difficulty is not ED.'
   and long_description is null;

update public.unified_tags
   set long_description =
'A sperm is a reproductive cell; semen is the fluid that carries sperm along with secretions from the seminal vesicles and prostate. Sperm are produced in the testicles and mature in the epididymis.

A semen analysis can measure concentration, movement and shape, but the appearance or volume of ejaculate cannot show whether someone is fertile. Testosterone, estrogen, anti-androgens, illness, medication and other factors can change production, which is why fertility preservation may be discussed before treatment that suppresses it.'
 where slug = 'sperm' and status = 'active'
   and description = 'The reproductive cell carried in semen. Production is suppressed by estrogen and anti-androgens, which is why fertility preservation is discussed before starting gender-affirming hormones.'
   and long_description is null;

-- This is the narrow human rewrite the terminology migration deliberately left
-- for later: preserve the surrounding STI definition byte-for-byte.
update public.unified_tags
   set description = replace(
     description,
     'Regular testing, safe sex practices, and open communication with partners are essential for prevention and management.',
     'Testing, vaccination, barriers, PrEP or PEP where relevant, and clear communication reduce specific risks and support early treatment.'
   )
 where slug = 'sti' and status = 'active'
   and description like '%Regular testing, safe sex practices, and open communication%';

-- Search/display aliases. Every alias is specific enough to be an intentional
-- vocabulary rule; no generic word such as "commitment" or "medication" lands.
insert into public.tag_aliases (
  canonical_tag_id, alias_name, alias_slug, alias_type, review_status
)
select t.id, a.alias_name, a.alias_slug, a.alias_type, 'approved'
  from _webmd_aliases a
  join public.unified_tags t on t.slug = a.target_slug and t.status = 'active'
 where not exists (select 1 from public.tag_aliases x where x.alias_slug = a.alias_slug)
   and not exists (select 1 from public.unified_tags u where u.slug = a.alias_slug)
   and not exists (
     select 1 from public.unified_tags u
      where lower(btrim(u.name)) = lower(btrim(a.alias_name))
        and u.id <> t.id
   );

-- One row per URL/tag pair. tag_sources has no unique index, so the NOT EXISTS
-- is load-bearing for replay safety.
create temporary table _webmd_sources (
  tag_slug text not null,
  source_url text not null,
  claim_summary text not null
) on commit drop;

insert into _webmd_sources values
  ('sexual-response-cycle', 'https://www.webmd.com/sex-relationships/sexual-health-your-guide-to-sexual-response-cycle', 'WebMD overview of excitement, plateau, orgasm and resolution; supplied source for this audit.'),
  ('sexual-response-cycle', 'https://my.clevelandclinic.org/health/articles/9119-sexual-response-cycle', 'Cleveland Clinic: phases can be absent, overlap or occur out of order; the cycle is not one-size-fits-all.'),
  ('refractory-period', 'https://www.webmd.com/sex-relationships/erection-after-sex', 'WebMD advice on the variable recovery interval after orgasm and non-penetrative options while it passes.'),
  ('refractory-period', 'https://my.clevelandclinic.org/health/articles/9119-sexual-response-cycle', 'Cleveland Clinic: resolution and the variable refractory period after orgasm.'),
  ('vulval-self-exam', 'https://www.webmd.com/women/what-is-a-vaginal-self-exam', 'Supplied guide to normal variation and noticing persistent vulval or vaginal changes.'),
  ('vulval-self-exam', 'https://www.acog.org/womens-health/faqs/pelvic-exams', 'ACOG: symptom-led pelvic examination, the distinction from cervical screening and limited evidence for routine screening exams.'),
  ('fear-of-intimacy', 'https://www.webmd.com/sex-relationships/signs-fear-intimacy', 'Supplied description of emotional, intellectual, physical and experiential intimacy and patterns of avoidance.'),
  ('fear-of-intimacy', 'https://www.apa.org/education/ce/adult-attachment-dimensions.pdf', 'APA continuing-education review: attachment avoidance is associated with compulsive self-reliance and fear of intimacy.'),
  ('fear-of-commitment', 'https://www.webmd.com/sex-relationships/commitment-phobia-symptoms-signs', 'Supplied description of commitment avoidance; used critically rather than as a diagnostic checklist.'),
  ('fear-of-commitment', 'https://dictionary.apa.org/fear-of-commitment', 'APA Dictionary: anxiety and uncertainty about becoming bound to a course of action, often involving intimacy and attachment.'),
  ('possessiveness', 'https://www.webmd.com/sex-relationships/signs-possessiveness', 'Supplied examples of monitoring, snooping, isolation and control.'),
  ('possessiveness', 'https://www.thehotline.org/resources/know-the-red-flags-of-abuse/', 'National Domestic Violence Hotline: possessive and controlling behavior can emerge and intensify as abuse develops.'),
  ('pde5-inhibitor', 'https://www.webmd.com/erectile-dysfunction/cialis-levitra-staxyn-viagra-treat-ed', 'Supplied comparison of sildenafil, tadalafil, vardenafil and avanafil and the class nitrate warning.'),
  ('pde5-inhibitor', 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0b0be196-0c62-461c-94f4-9a35339b4501', 'Sildenafil label: PDE5 mechanism, sexual stimulation requirement and contraindication with nitrates or nitrites.'),
  ('testicle', 'https://www.webmd.com/teens/testicles-faq', 'Supplied overview of normal asymmetry, temperature regulation, urgent torsion symptoms and self-examination.'),
  ('testicle', 'https://www.cancer.org/cancer/types/testicular-cancer/detection-diagnosis-staging/detection.html', 'American Cancer Society: insufficient evidence for a universal monthly self-exam recommendation; changes and lumps need assessment.'),
  ('erectile-dysfunction', 'https://www.webmd.com/erectile-dysfunction/erectile-dysfunction-coping', 'Supplied source on communication, emotional effects and treatment variability.'),
  ('erectile-dysfunction', 'https://www.webmd.com/erectile-dysfunction/cialis-levitra-staxyn-viagra-treat-ed', 'Supplied source on oral ED treatments and nitrate contraindication.'),
  ('sperm', 'https://www.webmd.com/infertility-and-reproduction/sperm-and-semen-faq', 'Supplied source distinguishing sperm cells from semen and describing semen analysis.'),
  ('masturbating', 'https://www.webmd.com/sex-relationships/masturbation-guide', 'Supplied source describing masturbation as common sexual self-stimulation rather than pathology.'),
  ('sti', 'https://www.webmd.com/sex-relationships/understanding-stds-basics', 'Supplied overview of sexually transmitted infections, testing and treatment.'),
  ('sti', 'https://www.webmd.com/sex-relationships/understanding-stds-prevention', 'Supplied prevention page; retained as an audit source while its absolute safe/unsafe framing was not imported.'),
  ('sti', 'https://www.cdc.gov/sti/prevention/index.html', 'CDC: route-specific STI transmission and prevention through vaccination, testing, barriers and other strategies.');

insert into public.tag_sources (
  tag_id, source_type, source_url, claim_summary, fetched_at, verified_at, is_public
)
select t.id, 'editorial', s.source_url, s.claim_summary, now(), now(), false
  from _webmd_sources s
  join public.unified_tags t on t.slug = s.tag_slug
 where not exists (
   select 1 from public.tag_sources x
    where x.tag_id = t.id and x.source_url = s.source_url
 );

do $verify$
declare
  v_n int;
  v_bad int;
  v_missing text;
begin
  -- All seven canonical pages exist, are reviewed, searchable inside the site,
  -- and remain outside the crawler index pending publication review.
  select count(*) into v_n
    from _webmd_new n
    join public.unified_tags t on t.slug = n.slug
   where t.status = 'active'
     and not t.seo_indexable
     and t.human_reviewed
     and t.verification_status in ('reviewed', 'locked')
     and tag_has_prose(t.description, t.short_description)
     and coalesce(btrim(t.long_description), '') <> '';
  if v_n <> 7 then
    select string_agg(n.slug, ', ') into v_missing
      from _webmd_new n
      left join public.unified_tags t on t.slug = n.slug
     where t.id is null
        or t.status <> 'active'
        or t.seo_indexable
        or not t.human_reviewed
        or t.verification_status not in ('reviewed', 'locked')
        or not tag_has_prose(t.description, t.short_description)
        or coalesce(btrim(t.long_description), '') = '';
    raise exception 'webmd glossary: only % of 7 canonical pages reached the reviewed, non-indexable state; missing/bad: %', v_n, coalesce(v_missing, '(unknown)');
  end if;

  -- Category ID, legacy display text and the primary junction all agree.
  select count(*) into v_bad
    from _webmd_new n
    join public.unified_tags t on t.slug = n.slug
    join public.tag_categories c on c.slug = n.category_slug
   where t.category_id is distinct from c.id
      or t.category is distinct from c.name
      or not exists (
        select 1 from public.tag_category_assignments a
         where a.tag_id = t.id and a.category_id = c.id and a.is_primary
      );
  if v_bad <> 0 then
    raise exception 'webmd glossary: % new pages disagree across category representations', v_bad;
  end if;

  -- Existing-page improvements, asserted by the safety facts rather than by
  -- this migration's exact wording.
  select count(*) into v_n from public.unified_tags
   where (slug = 'testicle' and long_description ilike '%sudden severe pain%' and long_description ilike '%monthly self-exam%')
      or (slug = 'erectile-dysfunction' and long_description ilike '%poppers%' and long_description ilike '%not the same thing%')
      or (slug = 'sperm' and long_description ilike '%semen is the fluid%' and long_description ilike '%semen analysis%');
  if v_n <> 3 then
    raise exception 'webmd glossary: only % of 3 existing anatomy/ED pages carry the audited improvement', v_n;
  end if;

  if exists (
    select 1 from public.unified_tags
     where slug = 'sti' and description ilike '%safe sex practices%'
  ) then
    raise exception 'webmd glossary: STI still contradicts the safer-sex terminology rule';
  end if;

  -- The relationship pages describe patterns without diagnosing a reluctant
  -- partner, and the self-exam page names the anatomy it actually inspects.
  select count(*) into v_bad from public.unified_tags
   where slug in ('fear-of-intimacy', 'fear-of-commitment', 'possessiveness')
     and (coalesce(description, '') || ' ' || coalesce(long_description, '')) ~*
         '(personality disorder|diagnose your partner|proof that someone)';
  if v_bad <> 0 then
    raise exception 'webmd glossary: % relationship page(s) import diagnostic checklist language', v_bad;
  end if;

  if not exists (
    select 1 from public.unified_tags
     where slug = 'vulval-self-exam'
       and long_description ilike '%vulva%rather than the internal vagina%'
       and long_description ilike '%does not replace cervical screening%'
  ) then
    raise exception 'webmd glossary: vulval-self-exam lost the anatomy/screening distinction';
  end if;

  -- At least two independent sources for every new page. A missing source row
  -- cannot hide behind a complete-looking article.
  select count(*) into v_bad
    from _webmd_new n
    join public.unified_tags t on t.slug = n.slug
   where (select count(distinct s.source_url) from public.tag_sources s where s.tag_id = t.id) < 2;
  if v_bad <> 0 then
    raise exception 'webmd glossary: % new page(s) have fewer than two sources', v_bad;
  end if;

  -- Rejected article-shaped headwords were not created or replaced. A newer
  -- corpus may already carry one as non-article utility vocabulary, so absence
  -- is not a valid postcondition; unchanged identity is.
  with current_rejected as (
    select slug, id from public.unified_tags
     where slug in ('sex-and-health', 'male-reproductive-system',
                    'female-reproductive-system', 'risky-sex')
  ), changed as (
    (select slug, id from current_rejected
     except select slug, id from _webmd_rejected_before)
    union all
    (select slug, id from _webmd_rejected_before
     except select slug, id from current_rejected)
  )
  select count(*) into v_bad from changed;
  if v_bad <> 0 then
    raise exception 'webmd glossary: % rejected umbrella/listicle identity change(s)', v_bad;
  end if;

  -- Every intended alias landed; a silent shadow skip must be visible.
  select count(*) into v_n from public.tag_aliases
   where alias_slug in ('human-sexual-response-cycle', 'post-orgasm-recovery-period',
                        'vaginal-self-exam', 'vulvar-self-exam',
                        'commitment-phobia', 'pde-5-inhibitor')
     and review_status = 'approved';
  if v_n <> 6 then
    raise exception 'webmd glossary: only % of 6 intentional aliases landed', v_n;
  end if;
end
$verify$;

commit;
