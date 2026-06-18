-- ============================================================================
-- Tag sensitivity false-positive cleanup, pass 2 ({prep}/{pep}/{minor} buckets)
-- ----------------------------------------------------------------------------
-- Pass 1 (20260618192000) only cleared sensitive_topics = {sti}. The same bad
-- batch also stamped {prep}/{pep}/{minor} (and combos) on innocuous tags:
-- Beef-Stew[prep], Bruschetta[prep,sti], Stonewall Riots[minor],
-- Gay-Rights-Movement[minor], Arabic-Coffee[prep,sti]. The "minor" hits are
-- mostly substring matches on "Mi-nor-a"/"mi-nor-ity".
--
-- Same asymmetric-safe rule, broadened topic set, with an extended keep-guard:
--   - never touches is_adult
--   - sensitive_topics must be a SUBSET of the garbage-prone generics
--     {sti,prep,pep,minor} (real topics like bdsm/hiv/aids/fetish keep the tag)
--   - keep if the NAME carries a sexual-health, minor/child, OR anatomical
--     signal (PrEP, Child, Children's Rights, Labia Majora/Minora stay gated)
-- Reuses the pass-1 backup table for reversibility.
-- ============================================================================
with cand as (
  select t.id, t.is_sensitive, t.sensitive_topics, t.seo_indexable
  from public.unified_tags t
  where t.status = 'active'
    and t.is_sensitive is true
    and coalesce(t.is_adult, false) = false
    and t.sensitive_topics <@ array['sti','prep','pep','minor']::text[]
    and array_length(t.sensitive_topics, 1) >= 1
    and t.sensitive_topics <> array['sti']::text[]   -- pass 1 handled this
    and not (
      t.name ~* '\m(sti|std|hiv|aids|prep|pep|syphilis|gonorrh|chlamydia|herpes|hpv|hepatitis|mpox|monkeypox|chemsex|sexual health|condom|bareback|prophylaxis|antiretroviral|sex work|sex worker|douche|enema)\M'
      or t.name ~* '\m(sex|sexual|testing|health screening)\M'
      or t.name ~* '\m(minor|child|children|youth|teen|teenager|kid|underage|under-age|age of consent|school|student|pupil|adolescen)\M'
      or t.name ~* '\m(labia|vulva|vagina|clitoris|penis|scrotum|testic|genital|anus|anal|nipple|breast)\M'
    )
)
insert into public.tag_sensitivity_cleanup_backup_20260618 (id, prev_is_sensitive, prev_sensitive_topics, prev_seo_indexable)
select id, is_sensitive, sensitive_topics, seo_indexable from cand
on conflict (id) do nothing;

update public.unified_tags t
set is_sensitive = false,
    sensitive_topics = '{}',
    seo_indexable = true
from public.tag_sensitivity_cleanup_backup_20260618 b
where b.id = t.id
  and t.is_sensitive is true
  and t.status = 'active'
  and coalesce(t.is_adult, false) = false
  and t.sensitive_topics <@ array['sti','prep','pep','minor']::text[]
  and t.sensitive_topics <> array['sti']::text[];
