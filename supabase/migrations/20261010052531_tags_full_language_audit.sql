-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261010052531 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Full review of all 8,493 active tag names; contextual corrections only.
-- Preserve native proper names and attested cultural/glossary terms.
SELECT set_config('app.actor', 'admin:tags-full-language-audit', true);

WITH fixes(slug, old_name, new_name, alias_type) AS (VALUES
('anthropologe','Anthropologe','Anthropologist','multilingual'),
('bergmann','Bergmann','Miner','multilingual'),
('choreograf','Choreograf','Choreographer','multilingual'),
('dragperformer','Dragperformer','Drag Performer','multilingual'),
('fkksauna','Fkksauna','Nudist Sauna','multilingual'),
('food-autor','Food Autor','Food Writer','multilingual'),
('fotograf','Fotograf','Photographer','multilingual'),
('gastwirt','Gastwirt','Hospitality Proprietor','multilingual'),
('gonorrhea-tripper','Gonorrhea (Tripper)','Gonorrhea','multilingual'),
('hauptbahnhof','Hauptbahnhof','Main Train Station','multilingual'),
('hingerichtet','Hingerichtet','Executed','multilingual'),
('ingwer-sour','Ingwer-Sour','Ginger Sour','multilingual'),
('innenarchitekt','Innenarchitekt','Interior Architect','multilingual'),
('kaufmann','Kaufmann','Merchant','multilingual'),
('koch','Koch','Chef','multilingual'),
('komponist','Komponist','Composer','multilingual'),
('kriminell','Kriminell','Criminal','multilingual'),
('literatur','Literatur','Literature','multilingual'),
('offenes','Offenes','Open Event','multilingual'),
('outdoor-terrazas','Outdoor-Terrazas','Outdoor Terraces','multilingual'),
('polizei','Polizei','Police','multilingual'),
('prag','Prag','Prague','multilingual'),
('produzent','Produzent','Producer','multilingual'),
('runder','Runder','Roundtable','multilingual'),
('sex-e-gender-distinction','Sex%E%%Gender Distinction','Sex-Gender Distinction','spelling_variant'),
('sexualisierte','Sexualisierte','Sexualized Violence','multilingual'),
('tagschristian-scheuss','Tagschristian Scheuß','Christian Scheuß','spelling_variant'),
('takat-c-pui','Takat%C%Pui','Takatāpui','spelling_variant'),
('theologe','Theologe','Theologian','multilingual'),
('tirol-based','Tirol-Based','Tyrol-Based','multilingual'),
('tv-moderator','Tv Moderator','TV Presenter','multilingual'),
('venezia','Venezia','Venice','multilingual'),
('verlag','Verlag','Publishing House','multilingual'),
('vorurteile','Vorurteile','Prejudice','multilingual'),
('espana','Espana','Spain','multilingual')
), renamed AS (
  UPDATE public.unified_tags u SET name = f.new_name
  FROM fixes f
  WHERE u.slug = f.slug AND u.name = f.old_name AND u.status = 'active'
  RETURNING u.id, f.slug AS old_slug, f.old_name, f.alias_type
)
INSERT INTO public.tag_aliases(canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
SELECT id, old_name, old_slug, alias_type, 'approved' FROM renamed
ON CONFLICT (alias_slug) DO NOTHING;

-- BEGiNE is a Berlin venue name. Undo its mistaken literal translation.
UPDATE public.unified_tags SET name = 'Begine'
WHERE slug = 'begine' AND name = 'Beguine' AND status = 'active';
UPDATE public.tag_aliases a SET review_status = 'rejected'
FROM public.unified_tags u
WHERE a.canonical_tag_id = u.id AND u.slug = 'begine'
  AND a.alias_slug = 'begine' AND a.alias_name = 'Begine'
  AND a.alias_type = 'multilingual';
UPDATE public.search_synonyms s SET status = 'archived'
FROM public.unified_tags u
WHERE s.tag_id = u.id AND u.slug = 'begine'
  AND s.terms = ARRAY['begine'] AND s.replacements = ARRAY['beguine']
  AND s.source = 'imported';

-- Existing descriptions attached to these occupation tags described namesakes
-- or an object. Replace those mismatched English definitions with the occupation.
UPDATE public.unified_tags u
SET description = f.description, short_description = f.short_description,
    wikipedia_url = NULL, wikidata_id = NULL,
    description_i18n = '{}'::jsonb
FROM (VALUES
 ('bergmann', 'A miner is a person who works extracting minerals or other materials from a mine.', 'A person who works in a mine.'),
 ('fotograf', 'A photographer is a person who creates photographs.', 'A person who creates photographs.'),
 ('gastwirt', 'A hospitality proprietor owns or runs a venue such as an inn, restaurant, pub, or nightclub.', 'An owner or operator of a hospitality venue.'),
 ('kaufmann', 'A merchant is a person who trades goods as a business.', 'A person who trades goods as a business.')
) AS f(slug, description, short_description)
WHERE u.slug = f.slug AND u.status = 'active';

UPDATE public.unified_tags
SET description = 'Takatāpui is a Māori identity term encompassing diverse sexual orientations, gender identities and expressions, and sex characteristics, inseparable from Māori identity.',
    short_description = 'A Māori term for diverse sexual and gender identities.'
WHERE slug = 'takatapui' AND name = 'Takatāpui' AND status = 'active';

-- These unused labels have no definition, source or linked content that establishes
-- their meaning. Keep them pending rather than fabricate an English translation.
UPDATE public.unified_tags
SET localisation_review_status = 'pending',
    localisation_review_note = 'Full English-name audit 2026-10-10: meaning unresolved; no definition, source or linked content found. Requires contextual review before translation.'
WHERE slug IN ('abc-teller', 'synchron') AND status = 'active';
;
