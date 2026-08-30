-- `stealthing` — the gap the UCSF trans-health pass named and deliberately left open.
--
-- 20261013110000 repaired `stealth`, which had been a scraped Wikipedia
-- disambiguation stub ("Stealth may refer to:") filed under Fetishes and
-- adult-gated, into the trans sense: living without disclosing that one is trans.
-- Its prose ends by distinguishing itself from "stealthing", and that migration's
-- header recorded the reason for not collapsing the two: same root word, entirely
-- different concepts, and one of them is a sexual assault. Pointing a reader who
-- searched for the assault at a page about trans privacy — or the reverse — is a
-- harm in both directions.
--
-- Leaving the reverse side absent was the right call for that migration and the
-- wrong resting state. Measured 2026-08-30: no tag, no alias, no row of any kind
-- for the concept, on a platform with 31 tags under Consent & Negotiation.
--
-- FILED UNDER CONSENT & NEGOTIATION, WHICH IS NOT AN ADULT CATEGORY. The six
-- adult stops are Sex & Kink, Practices & Play, Dynamics & Roles, Fetishes, Gear
-- and Kink Community & Scenes; Consent & Negotiation sits on the Safety & Consent
-- line with the rest of the safety vocabulary. That matters here: an age gate on
-- the page describing a form of assault would put it behind exactly the barrier
-- that stops someone reading it.
--
-- `is_sensitive` is true and `human_reviewed` is what keeps it readable —
-- `enforce_tag_seo_sensitivity_gate()` forces `seo_indexable := false` on a
-- sensitive row that is NOT human-reviewed, and `unified_tags_public_gated_read`
-- needs `verification_status in ('reviewed','locked')` for an anonymous reader.
--
-- THREE WRITES, NOT ONE, per the corrected INSERT rule. Neither category trigger
-- fires on INSERT (`trg_sync_tag_category` is BEFORE UPDATE,
-- `trg_sync_tag_category_after` is AFTER UPDATE OF category_id), so a bare insert
-- with `category_id` leaves the `category` text mirror NULL **and creates no
-- junction row at all** — which also means `unified_tags_recompute_is_adult()`
-- never runs. Harmless for a non-adult stop like this one, dangerous for an adult
-- one, so the pattern is the same either way: name `category` explicitly, insert
-- the junction row, then assert both.
--
-- No PEP dosing or protocol, consistent with the UCSF pass: that PEP exists and is
-- time-limited is the fact someone needs in the first hour, and the rest belongs
-- with a clinician.

select set_config('app.actor', 'admin:stealthing-tag-20260830', true);

do $mig$
declare
  v_cat_id uuid;
  v_tag_id uuid;
  v_rel_id uuid;
  a        text;
begin
  select id into strict v_cat_id from public.tag_categories where slug = 'consent-negotiation';

  insert into public.unified_tags (
    name, slug, entity_kind, status, description, short_description, long_description,
    is_sensitive, sensitive_topics, verification_status, human_reviewed,
    seo_indexable, category_id, category, last_verified_at
  ) values (
    'Stealthing', 'stealthing', 'concept', 'active',
    'Stealthing is removing or damaging a condom during sex without the other person''s knowledge or consent. Consent to protected sex is not consent to unprotected sex, and a growing number of jurisdictions prosecute it as a sexual offence.',
    'Removing a condom during sex without the other person''s consent.',
'Stealthing is removing a condom during sex, or deliberately damaging one, without the other person knowing or agreeing. It also covers agreeing to use one and then not doing so.

The principle is simple: consent to protected sex is not consent to unprotected sex. Someone who agreed to one act did not agree to the other, and removing the condom changes the act they consented to. It is a violation of consent, not a technicality about a barrier.

What it exposes people to is the reason it is treated seriously: HIV and other STIs, unwanted pregnancy where that applies, and the particular harm of finding out afterwards that a decision about your own body was taken from you. Survivors frequently describe that last part as the worst of it, and it is why "it was only a condom" is not a reasonable reading of what happened.

The law is moving. California, several Australian states, Germany, the UK and others now treat it as a sexual offence or as grounds for a civil claim, and elsewhere it is prosecuted under existing rape or assault statutes. Where you are changes what is available to you, so local advice is worth getting.

If it has happened to you: emergency HIV prevention (PEP) works only if started quickly, within 72 hours and sooner is better, so a clinic or emergency department is the first call rather than something to sleep on. STI testing has its own timings a clinician can explain. None of that obliges you to report it, and you can do the medical part without deciding anything else.

Unrelated to "stealth", which describes a trans person living without disclosing their trans history. The two share a root and nothing else.',
    true, array['consent','sexual violence'], 'reviewed', true, true, v_cat_id,
    (select name from public.tag_categories where id = v_cat_id), now()
  )
  on conflict (slug) do update set
    description         = excluded.description,
    short_description   = excluded.short_description,
    long_description    = excluded.long_description,
    is_sensitive        = true,
    sensitive_topics    = excluded.sensitive_topics,
    category_id         = excluded.category_id,
    category            = (select name from public.tag_categories where id = excluded.category_id),
    status              = 'active',
    verification_status = 'reviewed',
    human_reviewed      = true,
    seo_indexable       = true,
    merged_into_id      = null,
    deprecated_at       = null,
    deprecation_reason  = null,
    last_verified_at    = now(),
    updated_at          = now();

  select id into strict v_tag_id from public.unified_tags where slug = 'stealthing';

  -- The write that makes the row actually filed. One junction row per statement.
  insert into public.tag_category_assignments (tag_id, category_id, is_primary)
  values (v_tag_id, v_cat_id, true)
  on conflict (tag_id, category_id) do update set is_primary = true;

  -- Broader concept, only where it already exists — never minted.
  select id into v_rel_id from public.unified_tags
   where slug = 'consent' and status = 'active';
  if v_rel_id is not null and v_rel_id <> v_tag_id then
    insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
    values (v_tag_id, v_rel_id, 'broader', 1.0, 'approved')
    on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
  end if;

  -- `stealth` is deliberately NOT an alias and NOT a relation. It is the other
  -- concept, and the whole point of this tag is that the two stay apart.
  foreach a in array array['condom stealthing', 'non-consensual condom removal'] loop
    insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
    select v_tag_id, a, public.normalize_tag_slug(a), 'synonym', 'approved'
    where not exists (
      select 1 from public.unified_tags u
       where lower(u.slug) = public.normalize_tag_slug(a)
         and u.status = 'active' and u.id <> v_tag_id)
    on conflict (alias_slug) do nothing;
  end loop;
end
$mig$;

do $verify$
declare v_n int; v_txt text;
begin
  -- Live, reviewed, filed, and readable by a signed-out visitor despite being
  -- sensitive.
  select count(*) into v_n from public.unified_tags
   where slug = 'stealthing' and status = 'active' and human_reviewed
     and verification_status in ('reviewed','locked')
     and is_sensitive and seo_indexable and category_id is not null;
  if v_n <> 1 then
    raise exception 'stealthing: not publicly readable (matched % rows)', v_n;
  end if;

  -- All three filing surfaces, because INSERT populates none of them by itself.
  select count(*) into v_n
    from public.unified_tags t
    join public.tag_categories c on c.id = t.category_id
   where t.slug = 'stealthing' and c.slug = 'consent-negotiation'
     and t.category = c.name
     and exists (select 1 from public.tag_category_assignments a
                  where a.tag_id = t.id and a.category_id = c.id and a.is_primary);
  if v_n <> 1 then
    raise exception 'stealthing: category_id, text mirror and primary junction row do not all agree';
  end if;

  -- NOT adult-gated. An age gate on this page would block the reader it is for.
  select count(*) into v_n from public.unified_tags where slug = 'stealthing' and is_adult;
  if v_n <> 0 then
    raise exception 'stealthing: must not be adult-gated';
  end if;

  -- The three claims this page exists to make.
  select coalesce(long_description,'') into v_txt from public.unified_tags where slug = 'stealthing';
  if v_txt !~* 'consent to protected sex is not consent to unprotected sex' then
    raise exception 'stealthing: prose must state the consent principle';
  end if;
  if v_txt !~* '72 hours' then
    raise exception 'stealthing: prose must carry the PEP time limit';
  end if;
  if v_txt !~* 'trans' then
    raise exception 'stealthing: prose must disambiguate itself from `stealth`';
  end if;

  -- And the two senses stay separate rows, each pointing away from the other.
  select count(*) into v_n from public.unified_tags
   where slug = 'stealth' and status = 'active'
     and coalesce(long_description,'') ~* 'stealthing';
  if v_n <> 1 then
    raise exception 'stealth must keep its disambiguation against stealthing';
  end if;

  select count(*) into v_n from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where a.alias_slug = 'stealth' or (t.slug = 'stealthing' and a.alias_slug = 'stealth');
  if v_n <> 0 then
    raise exception 'stealth must never be an alias of stealthing';
  end if;
end
$verify$;
