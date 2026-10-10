-- English-label audit of all other public and administrative taxonomies.
-- Change display labels only. Retired import tokens stay inactive; German
-- aliases and all slugs, IDs, hierarchy, assignments and selections are retained.
SELECT set_config('app.actor','admin:other-taxonomy-english-label-audit',true);
WITH fixes(slug,old_name,new_name) AS (VALUES
('nonprofession-kunst','Kunst','Art'),
('nonprofession-politik','Politik','Politics'),
('nonprofession-literatur','Literatur','Literature'),
('nonprofession-musik','Musik','Music'),
('nonprofession-tanz','Tanz','Dance'),
('nonprofession-schauspiel','Schauspiel','Acting'),
('nonprofession-dienstleistung','Dienstleistung','Services'),
('nonprofession-mode','Mode','Fashion'),
('nonprofession-wissenschaft','Wissenschaft','Science')
)
UPDATE public.professions p SET name=f.new_name
FROM fixes f WHERE p.slug=f.slug AND p.name=f.old_name AND NOT p.is_active;

UPDATE public.event_amenities SET name='Wi-Fi',
 aliases=ARRAY(SELECT DISTINCT a FROM unnest(coalesce(aliases,'{}'::text[])||ARRAY['WiFi']) a)
WHERE name='WiFi';
UPDATE public.knowledge_base SET name='Wi-Fi'
WHERE slug='wifi' AND name='WiFi' AND category IN ('event_amenity','attribute');

-- Follow the already-established merge destinations directly. This does not
-- change a kink item, its category, its selection ID, or any user's choices.
WITH RECURSIVE links(item_slug,old_slug,new_slug) AS (VALUES
('tantra-slow-sex','intimate-tantra','tantra'),
('sensual-massage','intimate-massage','massage'),
('cuddling','intimate-cuddling','cuddling'),
('kissing','intimate-kissing','kissing'),
('oral-sex','intimate-oral','oral'),
('anal-fisting','intimate-fisting','fisting'),
('rimming','intimate-rimming','rimming'),
('anal-sex-pegging','intimate-anal','anal'),
('light-bondage','intimate-bondage','bondage'),
('spanking','intimate-spanking','spanking'),
('tickling','intimate-tickling','tickling'),
('public-teasing','intimate-public','public'),
('dildos','intimate-toys','toy'),
('edging','intimate-edging','edging'),
('roleplay-scenarios','intimate-roleplay','roleplay'),
('latex-rubber','intimate-rubber','rubber'),
('leather','intimate-leather','leather')
), chain AS (
 SELECT l.item_slug,l.old_slug,l.new_slug,t.id,t.slug,t.status,t.merged_into_id,0 AS depth
 FROM links l JOIN public.unified_tags t ON t.slug=l.old_slug
 UNION ALL
 SELECT c.item_slug,c.old_slug,c.new_slug,t.id,t.slug,t.status,t.merged_into_id,c.depth+1
 FROM chain c JOIN public.unified_tags t ON t.id=c.merged_into_id
 WHERE c.status='merged' AND c.depth<10
), resolved AS (
 SELECT * FROM chain WHERE status='active' AND slug=new_slug
)
UPDATE public.kink_items k SET unified_tag_slug=r.new_slug
FROM resolved r WHERE k.slug=r.item_slug AND k.unified_tag_slug=r.old_slug AND k.is_active;

DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM public.professions WHERE slug LIKE 'nonprofession-%' AND is_active) THEN
  RAISE EXCEPTION 'A retired profession-import token was activated';
 END IF;
 IF EXISTS(SELECT 1 FROM public.kink_items k LEFT JOIN public.unified_tags t ON t.slug=k.unified_tag_slug
  WHERE k.is_active AND k.unified_tag_slug IS NOT NULL AND (t.id IS NULL OR t.status<>'active')) THEN
  RAISE EXCEPTION 'An active kink item still references a non-canonical tag';
 END IF;
END $verify$;
