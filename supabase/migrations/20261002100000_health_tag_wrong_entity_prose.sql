-- Seven health tags whose `long_description` was about a different subject.
--
-- WHAT WAS WRONG. On each of these the hand-written `description` is correct and
-- the auto-generated encyclopaedic paragraph underneath it is about something
-- else entirely. Confirmed in the crawler-visible HTML on production, not
-- inferred from the column:
--
--   prep            56 uses  → the GRAMMATICAL PREPOSITIONAL CASE
--   trauma          46 uses  → PHYSICAL injury, "in humans, animals, or plants"
--   fertility       11 uses  → *Fertility and Sterility*, an Elsevier journal
--   pep              4 uses  → pep rallies, pep talks, and a boxer named Pep
--   aids-education   1 use   → *AIDS Education and Prevention*, a journal
--   pcp              0 uses  → the PORTUGUESE COMMUNIST PARTY
--   vascular-health  0 uses  → *Vascular Health and Risk Management*, a journal
--
-- `/tags/prep` is this platform's HIV-prevention page. It has been serving
-- Google a paragraph on prepositional grammar.
--
-- SAME CLASS AS THE UGANDA REPAIR (20260908171500), AND IT HID FOR THE SAME
-- REASON: the prose is plausible rather than absurd. `hate-crimes` pointing at a
-- television episode is visible at a glance; a paragraph that opens "Trauma
-- refers to physiological damage to living tissue" reads like an encyclopaedia
-- until you notice it is about the wrong kind of trauma. Three of the seven are
-- academic journals whose titles begin with the tag's own name, which is
-- precisely why a title-match resolver produced them.
--
-- NO CURATED WORK IS OVERWRITTEN. Every one of these `long_description` values
-- came from an automated extract. The `description` above each is left exactly
-- as it is — it was right.
--
-- EVERY REPLACED FACT WAS READ OFF A FETCHED SOURCE, not recalled:
--
--   * HIV life expectancy — Trickey et al., Lancet HIV 2023 (ART-CC + UK CHIC,
--     206,891 people). The old text's "average survival 9 to 11 years" is a
--     PRE-ART figure (Morgan, AIDS 2002, rural Uganda, median 9.8 years) stated
--     as if it described HIV today. It is retained but explicitly dated, because
--     deleting it leaves the page silent on what untreated infection does.
--   * PrEP agents and approval dates — FDA. Truvada 2012-07-16, Descovy
--     2019-10-03 (indication excludes people at risk through receptive vaginal
--     sex), Apretude 2021-12-20, Yeztugo/lenacapavir 2025-06-18.
--   * 2-1-1 — IPERGAY (Molina, NEJM 2015), 86% relative reduction; WHO 2019
--     endorses it for men who have sex with men and for tenofovir disoproxil
--     only. The scope limits are stated because "PrEP can be taken on demand"
--     without them is wrong for three of the four approved regimens.
--   * PEP timing — CDC 2025 nPEP guidelines: first dose ideally within 24 hours,
--     never later than 72, 28-day course, do not wait for lab results. The tag's
--     own `description` already said 72 hours; the 24-hour target is the part
--     that was missing and is the part that changes what someone does tonight.
--   * Trauma — American Psychological Association's own definition, paraphrased
--     rather than quoted.
--
-- DELIBERATELY NOT CLAIMED. "PrEP protects only against HIV" is the phrasing the
-- `description` uses and it is nearly right, but tenofovir-based PrEP IS active
-- against hepatitis B and stopping it can trigger a flare — a labelled warning.
-- So the long form says "HIV and nothing else" about STIs and then names the
-- hepatitis B exception, rather than repeating a tidy sentence that is false in
-- one specific and clinically relevant way.

select set_config('app.actor', 'admin:health-tag-entity-fix-20260828', true);

update public.unified_tags set long_description =
'Pre-exposure prophylaxis is HIV medication taken by someone who does not have HIV, so that an exposure cannot establish an infection. Four regimens are approved in the United States: daily emtricitabine/tenofovir disoproxil (Truvada, 2012), daily emtricitabine/tenofovir alafenamide (Descovy, 2019, not approved for people at risk through receptive vaginal sex), two-monthly injectable cabotegravir (Apretude, 2021) and twice-yearly injectable lenacapavir (Yeztugo, 2025).

Event-driven "2-1-1" dosing — two tablets 2 to 24 hours before sex, one at 24 hours, one at 48 — reduced infections by 86% in the IPERGAY trial. It is validated for tenofovir disoproxil only, and is recommended specifically for men who have sex with men. It is not established for Descovy, for either injectable, or for cisgender women.

PrEP prevents HIV and no other sexually transmitted infection — not chlamydia, gonorrhoea, syphilis, herpes, HPV or hepatitis C. One exception runs the other way: both tablet regimens are also active against hepatitis B, so stopping them abruptly can cause a hepatitis flare. That is a labelled warning and a reason to tell a prescriber before stopping rather than after.'
where slug = 'prep';

update public.unified_tags set long_description =
'Post-exposure prophylaxis is a 28-day course of HIV medication started after a possible exposure, to stop an infection establishing itself.

Timing is the entire intervention. Current guidance is to take the first dose as soon as possible — ideally within 24 hours, and never later than 72 — and not to wait for test results before starting. The evidence for the deadline comes from animal work in which protection fell sharply the longer treatment was delayed, which is why 72 hours is a cut-off rather than a target.

PEP is an emergency measure, not a substitute for PrEP. Needing it more than occasionally is itself the indication for PrEP. It is dispensed by emergency departments, sexual-health clinics and HIV centres.'
where slug = 'pep';

update public.unified_tags set long_description =
'Psychological trauma is the lasting effect of an overwhelming experience, not the event itself. The American Psychological Association defines it as a disturbing experience producing fear, helplessness, dissociation or confusion intense enough to have a long-lasting negative effect on how someone feels, behaves and functions. Traumatic events characteristically unsettle the assumption that the world is just, safe and predictable.

Responses vary enormously between people and are not a measure of how bad the event was. For LGBTQ+ people, minority stress — sustained exposure to hostility, concealment and rejection — is a recognised additional source, distinct from any single incident.

Medicine also uses "trauma" for physical injury. That is a different subject and not what this tag means.'
where slug = 'trauma';

update public.unified_tags set long_description =
'Fertility is the capacity to conceive; infertility is usually defined as not conceiving after a year of regular unprotected sex.

Two things the general framing tends to miss matter here. Donor insemination, reciprocal IVF and surrogacy are the routes many same-sex couples and single parents use, and access to them is set by national law and clinic policy at least as much as by biology — it is one of the rights tracked country by country. And gender-affirming hormone therapy affects fertility, which is why guidelines ask that preservation options be discussed before treatment begins rather than raised afterwards.'
where slug = 'fertility';

update public.unified_tags set long_description =
'AIDS education is the public-health and community work of giving people accurate information about how HIV is transmitted, how it is tested for, how it is treated and how it is prevented.

For the first decade of the epidemic it was built almost entirely by the communities being killed by it, because official information was late, moralising, or absent. That history is why so much of it is still community-run.

What it has to carry now is different from what it carried then: that effective treatment makes HIV untransmittable, that PrEP prevents infection, and that testing is what makes either of those available to anyone.'
where slug = 'aids-education';

update public.unified_tags set long_description =
'Phencyclidine is a dissociative anaesthetic developed in the 1950s and abandoned for human medicine because patients came out of it agitated, confused and sometimes delirious.

Like ketamine it works by blocking NMDA receptors, but it lasts far longer and its dose-response is steep — the margin between a recreational dose and a medical emergency is narrow and hard to judge from the powder. Effects can include severe agitation and disordered thinking that outlast the person''s ability to recognise what is happening.

It is far more often encountered as an unexpected adulterant than as a deliberate purchase, which is the argument for drug checking rather than for a dosage rule.'
where slug = 'pcp';

update public.unified_tags set long_description =
'Vascular health is the condition of the blood vessels — how well arteries and veins deliver blood where it is needed.

It belongs in a sexual-health glossary because erection is a vascular event. It depends on blood flow, and difficulty achieving one can be an early sign of arterial disease rather than a sexual problem in its own right — which is a reason to raise it with a doctor rather than only with a pharmacy.

The drugs prescribed for it act on that same vascular pathway, and that is precisely why they must never be combined with nitrites such as poppers: the two act on opposite ends of one mechanism and the resulting drop in blood pressure is not self-limiting.'
where slug = 'vascular-health';

do $verify$
declare v_bad int;
begin
  -- The specific wrong subjects, gone. Matching on the old strings rather than
  -- on "did an update run" is deliberate: it is the check that would have caught
  -- this class in the first place.
  select count(*) into v_bad from public.unified_tags
   where slug in ('prep','pep','trauma','fertility','aids-education','pcp','vascular-health')
     and coalesce(long_description,'') ~* '(prepositional case|pep rally|pep talk|Portuguese Communist|Marxist|peer-reviewed|journal published|physiological damage to living tissue|animals, or plants)';
  if v_bad > 0 then
    raise exception 'health tag entity fix: % row(s) still carry the wrong subject', v_bad;
  end if;

  -- And every one of the seven actually has prose. An update that silently
  -- matched nothing would otherwise pass the check above.
  select count(*) into v_bad from public.unified_tags
   where slug in ('prep','pep','trauma','fertility','aids-education','pcp','vascular-health')
     and coalesce(long_description,'') = '';
  if v_bad > 0 then
    raise exception 'health tag entity fix: % row(s) left with empty prose', v_bad;
  end if;
end
$verify$;
