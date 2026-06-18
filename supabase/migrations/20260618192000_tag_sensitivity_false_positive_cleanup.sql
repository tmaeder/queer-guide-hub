-- ============================================================================
-- Clear false-positive is_sensitive flags (the bogus {sti}-only batch)
-- ----------------------------------------------------------------------------
-- A historical classification run mislabeled ~500 innocuous tags as sensitive
-- with sensitive_topics = {sti} — "Restaurant", "Coffee", "LGBTQ+", "Human
-- Rights", "Accessibility", "Gin", "Pretzels" etc. The is_sensitive flag gates
-- a tag from BOTH SEO indexing (enforce_tag_seo_sensitivity_gate) and from
-- auto-enrichment (the sweep review-queues sensitive tags instead of filling
-- them), so this single bad batch was the largest contributor to the SEO block
-- and the review backlog.
--
-- Asymmetric-safe cleanup: only tags that are
--   - is_sensitive = true AND is_adult = false  (adult tags are NEVER touched)
--   - sensitive_topics EXACTLY {sti}            (the garbage default)
--   - name has NO sexual-health/sex signal      (keeps "STI", "Casual Sex",
--                                                 "Chemsex", "Congenital
--                                                 Syphilis", etc. gated)
-- get cleared. seo_indexable is restored to true (the gate no longer forces it
-- false once the tag is non-sensitive). None of the written columns are in the
-- trg_search_documents_tag watch list, so no search-document storm.
--
-- Prior state is snapshotted into tag_sensitivity_cleanup_backup_20260618 for
-- full reversibility:
--   update unified_tags u set is_sensitive=true, sensitive_topics=b.prev_topics,
--     seo_indexable=b.prev_seo_indexable
--   from tag_sensitivity_cleanup_backup_20260618 b where b.id=u.id;
-- ============================================================================
create table if not exists public.tag_sensitivity_cleanup_backup_20260618 (
  id uuid primary key,
  prev_is_sensitive boolean,
  prev_sensitive_topics text[],
  prev_seo_indexable boolean,
  backed_up_at timestamptz default now()
);

with affected as (
  select t.id, t.is_sensitive, t.sensitive_topics, t.seo_indexable
  from public.unified_tags t
  where t.status = 'active'
    and t.is_sensitive is true
    and coalesce(t.is_adult, false) = false
    and t.sensitive_topics = array['sti']::text[]
    and not (
      t.name ~* '\m(sti|std|hiv|aids|prep|pep|syphilis|gonorrh|chlamydia|herpes|hpv|hepatitis|mpox|monkeypox|chemsex|sexual health|condom|bareback|prophylaxis|antiretroviral|sex work|sex worker|douche|enema)\M'
      or t.name ~* '\m(sex|sexual|testing|health screening)\M'
    )
)
insert into public.tag_sensitivity_cleanup_backup_20260618 (id, prev_is_sensitive, prev_sensitive_topics, prev_seo_indexable)
select id, is_sensitive, sensitive_topics, seo_indexable from affected
on conflict (id) do nothing;

update public.unified_tags t
set is_sensitive = false,
    sensitive_topics = '{}',
    seo_indexable = true
from public.tag_sensitivity_cleanup_backup_20260618 b
where b.id = t.id
  and t.is_sensitive is true;
