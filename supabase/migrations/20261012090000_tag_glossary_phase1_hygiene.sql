-- Tag glossary content quality, phase 1: stop publishing content that says
-- nothing or worse than nothing. Three classes, all measured on prod
-- 2026-08-29; counts below are documentation, not assertions — every
-- statement is idempotent and safe against concurrent sessions draining rows.
--
-- A) 47 tag_aliases rows whose alias_name equals the canonical tag's own name
--    (case-insensitive). "Also called: Festival" on /tags/festival asserts
--    nothing; several were minted alongside real aliases by the sitelink
--    importer. Their bridged search_synonyms rows are identity rewrite rules
--    (terms=[name] → replacements=[name]) — deleted where not activated
--    (measured: 0 are active). The FK is ON DELETE SET NULL, so the explicit
--    delete is what keeps the synonyms table free of dead identity rules.
--
-- B) 1 mojibake alias ("M?Llerian" carrying U+FFFD): a replacement character
--    can never be a legitimate alias spelling, and the correctly-spelt row
--    exists separately.
--
-- C) 175 rows (109 active) publish the literal import stamp
--    "No information available" as short_description. Same class as the
--    kinktionary import stamps 20261007163400 retired: a stamp reads as
--    content and defeats `indexable_without_description` and
--    `run_tag_thin_page_reindex()`, both of which only see blanks. A blank is
--    measurable, gets the page deindexed automatically, and self-heals the
--    moment real prose is written.
--
-- D) 38 long_descriptions are LLM refusal essays beginning "There is no
--    information available …" — a full paragraph of apology published as the
--    definition of the term ("…about shoe stealing in the context of LGBTQ+
--    travel"). Anchored prefix match so a legitimate definition that merely
--    contains the phrase mid-sentence is untouched.
--
-- `app.actor` is required: log_unified_tag_change() raises on human_reviewed
-- rows without it (precedent 20261007163400).

select set_config('app.actor', 'admin:tag-glossary-hygiene-20260829', true);

-- A) identity aliases: bridge rows first (delete would only SET NULL the link)
with doomed as (
  select a.id
  from public.tag_aliases a
  join public.unified_tags t on t.id = a.canonical_tag_id
  where lower(a.alias_name) = lower(t.name)
)
delete from public.search_synonyms s
using doomed d
where s.tag_alias_id = d.id
  and s.status <> 'active';

delete from public.tag_aliases a
using public.unified_tags t
where t.id = a.canonical_tag_id
  and lower(a.alias_name) = lower(t.name);

-- B) mojibake (U+FFFD)
delete from public.search_synonyms s
using public.tag_aliases a
where s.tag_alias_id = a.id
  and position(chr(65533) in a.alias_name) > 0
  and s.status <> 'active';

delete from public.tag_aliases
where position(chr(65533) in alias_name) > 0;

-- C) the short_description stamp (exact trimmed match, any status — a
--    deprecated row revived later must not resurrect the stamp with it)
update public.unified_tags
set short_description = null
where short_description is not null
  and lower(btrim(short_description)) = 'no information available';

-- D) refusal essays as long_description (anchored at the start)
update public.unified_tags
set long_description = null
where long_description is not null
  and btrim(long_description) ~* '^there is no information available';
