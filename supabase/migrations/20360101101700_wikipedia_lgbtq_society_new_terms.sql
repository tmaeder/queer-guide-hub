-- Create 20 glossary terms present in three English Wikipedia categories —
-- LGBTQ and disability, LGBTQ and health, LGBTQ and society — and absent from
-- `unified_tags` under any status.
--
-- Only the CATEGORY LISTING was used, as a signal for which concepts the
-- glossary has no row for. No Wikipedia prose is copied or paraphrased; every
-- definition below is original text written from the documented, independently
-- attested meaning of the term, which is what `editorial:general-knowledge`
-- records. (Wikipedia's own licence would permit attributed reuse; not relying
-- on it keeps the provenance claim on these rows true as written, and matches
-- how every other import in this repo has been handled.)
--
-- THE LIST IS TRIAGED, NOT TRANSCRIBED. The three categories yield 96 direct
-- pages, and most are not glossary terms: films (Margarita with a Straw),
-- journals (Journal of Gay & Lesbian Mental Health), organisations, TLDs (.gay,
-- .lgbt) and article-shaped topics that name a subject rather than a concept
-- (Media portrayal of lesbians, Sexuality and space, Societal attitudes toward
-- homosexuality). Those are deliberately absent.
--
-- SO ARE THE NEAR-DUPLICATES, and they are worth naming because creating them
-- is the easy mistake here:
--   Bisexual erasure              -> `bi-erasure` exists; revived in 20360101101600
--   Mental health of LGBTQ people -> `mental-health` + `lgbtq-mental-health` exist
--   LGBTQ bullying                -> `bullying` exists and is active
--   Suicide among LGBTQ people    -> `suicide` exists and already carries the raised-risk framing
--   Discrimination against lesbians -> `lesbophobia` exists as a deprecated row;
--                                    the right fix is to revive THAT, not to add a
--                                    second row under a descriptive name. Left for
--                                    a follow-up rather than half-checked here.
--   Anti-LGBTQ rhetoric           -> overlaps `hate-speech`, which is active
--   Neuroqueer theory             -> `neuroqueer` already exists and is active
--
-- NOTHING HERE IS PUBLISHED. seo_indexable=false, human_reviewed=false,
-- verification_status='unverified'. A machine-written definition of a political
-- or identity term is a draft, and several of these are contested vocabulary
-- where the framing matters as much as the fact — political lesbianism and
-- homohysteria are arguments as much as they are descriptions, and the rows say
-- so rather than flattening them.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:wikipedia-society-terms', true);

do $mig$
declare
  r      record;
  v_bad  int;
  v_made int := 0;
begin
  create temp table _new (
    slug text primary key, name text, cat text, sensitive boolean, descr text, longd text
  ) on commit drop;

  insert into _new (slug, name, cat, sensitive, descr, longd) values
    ('compulsory-heterosexuality', 'Compulsory Heterosexuality', 'sexual-orientation', false,
     'The idea that heterosexuality is not simply common but socially enforced, and assumed until contradicted.',
     'Compulsory heterosexuality is the argument, set out by Adrienne Rich in 1980, that heterosexuality is not a neutral default that most people happen to land on but an institution actively maintained — through law, family expectation, media and economic pressure — and that women in particular are steered into it rather than choosing it freely.

The term is often shortened to "comphet" in current usage, especially among lesbians describing the period before they recognised their own orientation: relationships that felt obligatory rather than wanted, attraction assumed because it was expected. That everyday sense is narrower than Rich''s, which was a structural claim about power rather than a description of individual confusion.

It remains a contested idea. The critique that it under-describes genuine heterosexual desire is long-standing, and Rich''s own framing has been argued with from within lesbian feminism as much as from outside it.'),

    ('heteropatriarchy', 'Heteropatriarchy', 'political-activism', false,
     'A social system in which both heterosexuality and male authority are treated as the natural order.',
     'Heteropatriarchy names the overlap of two arrangements that are usually analysed separately: patriarchy, where men hold structural power, and heteronormativity, where opposite-sex relationships are the assumed default. The compound argues they are not two systems but one, because each props the other up — the authority of men is organised through the heterosexual family, and the heterosexual family is what assigns that authority.

It is used most in queer, feminist and decolonial scholarship, often to make the point that gaining acceptance within existing structures is not the same as dismantling them.'),

    ('heteronationalism', 'Heteronationalism', 'political-activism', false,
     'The framing of the nation itself as heterosexual, so that belonging is tied to conforming sexuality.',
     'Heteronationalism describes the way national identity is often built around the heterosexual family — reproduction as a duty to the country, the family as the nation in miniature — with the result that queer people are positioned as marginal to the nation rather than simply as a minority within it.

It is the analytical companion to homonationalism, and the two are frequently confused. Homonationalism describes a state claiming LGBTQ+ rights as proof of its own superiority; heteronationalism describes a state defining itself as straight in the first place. A country can move from one to the other without either being about queer people''s actual welfare.'),

    ('homohysteria', 'Homohysteria', 'culture-community', false,
     'Fear of being thought gay, and the way it polices how straight men behave with each other.',
     'Homohysteria, a term introduced by the sociologist Eric Anderson, names a specific cultural condition: one where homosexuality is known to be common, being gay is stigmatised, and gender conformity is read as evidence of orientation. Where all three hold, straight men police their own affection, dress and friendships to avoid being suspected.

The concept''s useful move is that it explains change. As acceptance rises, homohysteria falls, and behaviours that were unavailable become ordinary again — physical affection between male friends, emotional openness, clothing choices. Anderson uses it to account for observed shifts in young men''s behaviour without claiming homophobia itself has disappeared.'),

    ('homosociality', 'Homosociality', 'culture-community', false,
     'Same-sex social bonding, which is not in itself about sexual attraction.',
     'Homosociality describes social bonds between people of the same sex — male friendship groups, women''s circles, single-sex institutions — and the term exists precisely to separate that from sexual desire. Much of the scholarship, following Eve Kosofsky Sedgwick, examines how strongly male homosociality is defended against being read as homosexual, and how that defence shapes the behaviour inside it.

It is descriptive rather than evaluative: a homosocial space can be a refuge or an instrument of exclusion, and often both at once.'),

    ('heterosociality', 'Heterosociality', 'culture-community', false,
     'Social bonding across sexes, as distinct from sexual or romantic interest.',
     'Heterosociality describes non-sexual social relationships between people of different sexes — mixed friendship groups, mixed workplaces, mixed social settings. Like homosociality it is a claim about who people spend their time with, not about who they are attracted to.

The term earns its place mainly by contrast: it makes visible that the separation of social life by sex is a choice a culture makes rather than a given, and that where mixed friendship is treated as implausible, it is usually because attraction is assumed to be the only reason for the contact.'),

    ('lavender-marriage', 'Lavender Marriage', 'marriage-partnership', false,
     'A marriage of convenience that conceals one or both partners'' sexuality.',
     'A lavender marriage is a marriage entered into to disguise the sexual orientation of one or both spouses. The phrase attaches particularly to the Hollywood studio era, when contracts and public morality clauses made a visible marriage close to a professional requirement, but the arrangement is far older and far wider than the film industry.

Such marriages are not all the same thing. Some were arranged between two queer people with full mutual knowledge and functioned as a working alliance; others concealed the truth from a spouse who had not agreed to it, which is a different matter entirely. In places where homosexuality is criminalised or where family pressure is severe, they are a present-tense survival strategy rather than history.

Distinguish it from a mixed-orientation marriage, where the difference in orientation is not the point of the marriage.'),

    ('political-lesbianism', 'Political Lesbianism', 'political-activism', false,
     'The position that women should withdraw from relationships with men as a political act.',
     'Political lesbianism emerged from 1970s radical and separatist feminism as the argument that relationships with men sustain male power, and that women should therefore direct their energy, and in the stronger version their sexual relationships, toward women. Its best-known formulation held that a political lesbian is a woman-identified woman who does not sleep with men, explicitly not requiring desire.

It was heavily contested at the time and remains so. The central objection, made loudest by lesbians themselves, is that it treats lesbian identity as a political choice rather than an orientation, which both misdescribes lesbian lives and implies that attraction is a matter of will. It is included here as a documented position in feminist history, not as a description of what being a lesbian is.'),

    ('bisexual-chic', 'Bisexual Chic', 'culture-community', false,
     'Periods when bisexuality is treated as fashionable, usually without improving how bisexual people are treated.',
     'Bisexual chic names the recurring pattern where bisexuality becomes briefly modish in celebrity culture and the press — most cited in the 1970s, and repeatedly since — and is then discussed as a style rather than an orientation.

The reason it is a critical term rather than a neutral one is what it does to bisexual people. Framing bisexuality as a trend supports the assumption that it is a phase or a performance, which is the same assumption underneath bisexual erasure; the visibility does not convert into being believed. Periods of bisexual chic have generally not been followed by measurable improvements in how bisexual people are treated within either straight or queer communities.'),

    ('gay-and-trans-panic-defense', 'Gay and Trans Panic Defense', 'legal-rights', false,
     'A legal strategy arguing a victim''s sexuality or gender identity provoked the violence against them.',
     'The gay and trans panic defense is a courtroom strategy in which a defendant argues that discovering the victim was gay or trans provoked them into violence, and that their culpability should therefore be reduced. It is not a standalone defence in most jurisdictions; it is usually run through existing provocation, diminished capacity or self-defence doctrine.

The objection is that it asks a court to accept a person''s identity as a reason for the harm done to them, and it has been used most visibly in the killings of trans women. A number of jurisdictions have legislated to bar it — several US states beginning with California in 2014, and comparable reform has been enacted elsewhere — but it remains available in many.

For travellers this belongs to the same question as criminalisation: whether local law treats violence against you as fully wrong is not answered by whether that violence is nominally illegal.'),

    ('gay-bashing', 'Gay Bashing', 'violence-hate', false,
     'Physical assault on someone because they are, or are assumed to be, LGBTQ+.',
     'Gay bashing is violence targeting a person for their actual or perceived sexual orientation or gender identity. The word arrived from the language of the assaults themselves and is now used both descriptively and in advocacy.

Two features distinguish it from assault generally. It is frequently committed by groups rather than individuals, and it is aimed at perception rather than fact — people are attacked for how they look, who they are with, or where they are leaving, which is why straight and cisgender people are also among those assaulted. Reporting rates are low where reporting risks outing someone or exposing them to the police as a further hazard, so recorded figures understate it nearly everywhere.'),

    ('gay-wage-gap', 'Gay Wage Gap', 'workplace-education-policy', false,
     'The measured earnings difference between LGBTQ+ workers and comparable heterosexual ones.',
     'The gay wage gap is the difference in earnings between LGBTQ+ people and otherwise comparable heterosexual workers, after controlling for education, occupation and hours.

The findings are not uniform in direction, which is the interesting part. Gay men have consistently been measured earning less than heterosexual men in similar roles, while partnered lesbians have often been measured earning more than heterosexual women — a result usually attributed to differences in labour-force attachment and household specialisation rather than to any advantage. Trans people, where they are counted at all, show the largest and most consistent penalty, with earnings frequently falling after transition.

The main methodological problem is who gets counted: most datasets identify orientation through cohabitation, so single LGBTQ+ people and anyone not out to a survey are missing.'),

    ('drag-panic', 'Drag Panic', 'violence-hate', false,
     'Organised alarm about drag performance, framing it as a danger to children.',
     'Drag panic describes coordinated political and media campaigns presenting drag performance — particularly all-ages events and library story hours — as sexual, predatory or harmful to children, and the legislation, protests and threats that follow.

It is a moral panic in the technical sense: the alarm is out of proportion to any demonstrated harm, it is amplified by organised groups rather than arising spontaneously, and it recycles the much older claim that queer people endanger children. Its practical effects are concrete — cancelled events, venue insurance withdrawn, performers doxxed, armed protests, and statutes restricting performance in public — which is why it appears on a travel platform: it changes which events actually happen and how safe they are to attend.'),

    ('fetishization-of-lgbtq-people', 'Fetishization of LGBTQ People', 'culture-community', false,
     'Reducing a queer or trans person to an object of sexual interest defined by their identity.',
     'Fetishization here means treating someone''s sexual orientation or gender identity as the thing that makes them desirable, rather than as one fact about a person. It covers the treatment of lesbians as performers for a straight male audience, the framing of trans women as a category to be sought out rather than as women, and the exoticising of queer people of colour along racial lines at the same time.

It is distinguished from ordinary attraction by substitution: the person is interchangeable with anyone sharing the trait. That is what makes it experienced as objectifying even when it is meant as flattery, and it frequently sits alongside a refusal to be seen with the person publicly.'),

    ('mixed-orientation-marriage', 'Mixed-Orientation Marriage', 'marriage-partnership', false,
     'A marriage between partners of different sexual orientations.',
     'A mixed-orientation marriage is one where the spouses do not share a sexual orientation — most often a gay, lesbian or bisexual person married to a heterosexual partner. Some began before one partner understood or disclosed their orientation; others are entered into knowingly.

Outcomes vary widely, and the research does not support a single narrative. Some couples renegotiate the marriage, including opening it, and remain together for decades; many separate. What predicts the difference is less the orientation than whether the disclosure was made honestly and how much each partner is asked to give up without saying so.

It is distinct from a lavender marriage, where concealment is the purpose of the marriage rather than a circumstance within it.'),

    ('same-sex-parenting', 'Same-Sex Parenting', 'family-chosen-family', false,
     'Children raised by two parents of the same sex.',
     'Same-sex parenting covers families where a child is raised by two mothers or two fathers, reached through adoption, fostering, donor conception, surrogacy, co-parenting arrangements, or a child from a previous relationship.

The research position is unusually settled for a contested political topic: across decades of studies, outcomes for children raised by same-sex parents are indistinguishable from those raised by different-sex parents on the measures usually examined, and the major paediatric and psychological professional bodies have said so explicitly. Where differences do appear they track stigma and legal insecurity rather than the parents'' sex.

The legal position is not settled at all, and that is the practical issue. Adoption rights, second-parent recognition, birth-certificate rules and access to fertility treatment vary enormously between countries and sometimes within them, so a family recognised at home may not be recognised at a border.'),

    ('pink-money', 'Pink Money', 'political-activism', false,
     'The purchasing power of LGBTQ+ consumers, treated as a market.',
     'Pink money — also called the pink pound, pink dollar or pink euro — refers to the spending power of LGBTQ+ people considered as a commercial segment. The concept became prominent as businesses recognised an audience worth advertising to, and it underlies a good deal of the visible corporate presence at Pride events.

It cuts in two directions and both are real. Being commercially valuable has bought material things: venues, sponsorship for events that would not otherwise happen, and a reason for companies to oppose hostile legislation. It has also produced a distorted picture of a uniformly affluent community, which is contradicted by the measured earnings and poverty data, and it makes support contingent on remaining profitable — which is the criticism carried by rainbow capitalism.'),

    ('lgbtq-conservatism', 'LGBTQ Conservatism', 'political-activism', false,
     'Conservative and right-leaning politics among LGBTQ+ people.',
     'LGBTQ conservatism describes LGBTQ+ people who hold conservative political positions, and the organisations that represent them. It is not a single position: it ranges from people whose economic or foreign-policy views sit on the right while supporting LGBTQ+ rights, to those who oppose parts of the mainstream LGBTQ+ political programme.

It is documented here because the assumption that LGBTQ+ people vote as a bloc is inaccurate and shapes how both campaigners and opponents behave. The internal argument is long-running and sharp, particularly where conservative LGBTQ+ figures are cited in support of policies that the wider community opposes.'),

    ('women-who-have-sex-with-women', 'Women Who Have Sex With Women', 'sexual-health', true,
     'A public-health category defined by behaviour rather than identity, usually written WSW.',
     'Women who have sex with women, abbreviated WSW, is an epidemiological and clinical category covering any woman who has sex with women regardless of how she identifies. It exists because health risk follows what people do, not what they call themselves, and a substantial number of women who have sex with women do not describe themselves as lesbian or bisexual.

It is a research and clinical term, not an identity, and using it as one is a misuse — it was constructed to count behaviour. Its practical importance is that WSW have historically been told they are at negligible risk of sexually transmitted infections, which is false: transmission occurs through skin contact, shared toys and oral sex, and the resulting under-screening is a documented gap in care, including lower cervical screening rates.

It is the counterpart of men who have sex with men (MSM), and both terms carry the same caution.'),

    ('lgbtq-life-expectancy', 'LGBTQ Life Expectancy', 'health', false,
     'Measured differences in how long LGBTQ+ people live, and what drives them.',
     'LGBTQ life expectancy refers to research on whether LGBTQ+ people live shorter lives than the general population and why. The measured differences are real, and the mechanisms behind them are the substance of the topic: suicide, violence, substance use, delayed or avoided medical care, and the physiological effects of sustained stress from stigma — the minority stress model.

Two cautions belong with any number quoted here. Most historical estimates come from cohorts shaped by the HIV epidemic and by criminalisation, so they describe a period as much as a population. And death records rarely capture orientation or gender identity at all, which means much of this literature infers rather than counts, and the widely circulated figures for trans life expectancy in particular are frequently misattributed and do not withstand checking.');

  ------------------------------------------------------------------ guards
  select count(*) into v_bad from _new n
   where not exists (select 1 from public.tag_categories c where c.slug = n.cat);
  if v_bad > 0 then
    raise exception 'society terms: % row(s) name a category that does not exist', v_bad;
  end if;

  -- Any pre-existing slug aborts, in any status. A deprecated collision would
  -- mean the concept is a REVIVAL and belongs in 20360101101600, not here.
  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug;
  if v_bad > 0 then
    raise exception 'society terms: % slug(s) already exist — resolve by hand', v_bad;
  end if;

  -- A slug held as an alias of another tag cannot become a tag: two rows would
  -- answer to one name, and `tag_reject_alias_shadow()` aborts the INSERT. It is
  -- checked here so the message names the whole set rather than one row
  -- mid-loop. This is not hypothetical — it is what stopped `pinkwashing` and
  -- `queer-theory` in the sibling revival migration.
  select count(*) into v_bad from _new n
   where exists (select 1 from public.tag_aliases a where a.alias_slug = n.slug);
  if v_bad > 0 then
    raise exception 'society terms: % slug(s) are held as an alias of another tag', v_bad;
  end if;

  ------------------------------------------------------------------ create
  for r in select * from _new order by slug loop
    insert into public.unified_tags (
      name, slug, description, long_description,
      category_id, category, entity_kind,
      is_adult, is_sensitive,
      status, seo_indexable, human_reviewed, verification_status
    )
    select r.name, r.slug, r.descr, r.longd,
           c.id, c.name, 'concept'::tag_entity_kind,
           false, r.sensitive,
           'active', false, false, 'unverified'
      from public.tag_categories c where c.slug = r.cat;
    v_made := v_made + 1;

    insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
    select t.id, 'editorial:general-knowledge',
           'Definition written from independently documented meaning. English Wikipedia category listings (LGBTQ and disability / health / society) were used only to identify that this concept had no row; no Wikipedia text is copied or paraphrased.',
           false
      from public.unified_tags t where t.slug = r.slug;
  end loop;

  if v_made <> 20 then
    raise exception 'society terms: expected 20, created %', v_made;
  end if;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _new n
   where not exists (select 1 from public.unified_tags t where t.slug = n.slug);
  if v_bad > 0 then
    raise exception 'society terms: % row(s) were not created', v_bad;
  end if;

  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where t.seo_indexable or coalesce(t.human_reviewed, false)
      or t.verification_status <> 'unverified';
  if v_bad > 0 then
    raise exception 'society terms: % row(s) are publishable — they must be created unreviewed and unindexed', v_bad;
  end if;

  select count(*) into v_bad from _new n
    join public.unified_tags t on t.slug = n.slug
   where t.category_id is null
      or not exists (select 1 from public.tag_sources s
                      where s.tag_id = t.id and s.source_type like 'editorial:%');
  if v_bad > 0 then
    raise exception 'society terms: % row(s) lack a category or a provenance record', v_bad;
  end if;

  select count(*) into v_bad from public.unified_tags
   where status = 'active' and seo_indexable
     and coalesce(nullif(btrim(description), ''), short_description) is null;
  if v_bad > 0 then
    raise exception 'society terms: % indexable row(s) corpus-wide have no description', v_bad;
  end if;

  raise notice 'society terms: % created', v_made;
end
$mig$;
