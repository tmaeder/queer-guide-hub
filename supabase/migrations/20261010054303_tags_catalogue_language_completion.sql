-- Completion of the full English tag-name audit.
-- Source context includes legacy personality tag arrays, not only junctions.
-- Same-meaning translations are merged reversibly; different senses stay separate.
SELECT set_config('app.actor','admin:tags-catalogue-language-completion',true);
SET LOCAL statement_timeout = '600s';

WITH fixes(slug,old_name,new_name) AS (VALUES
('astrolog','Astrolog','Astrologer'),
('texter','Texter','Lyricist'),
('synchron','Synchron','Dubbing'),
('abasiophillia','Abasiophillia','Abasiophilia'),
('acrotomophillia','Acrotomophillia','Acrotomophilia'),
('aperativo','Aperativo','Aperitivo'),
('apetizers','Apetizers','Appetizers'),
('caneing','Caneing','Caning'),
('cuckhold','Cuckhold','Cuckold'),
('cunnlingus','Cunnlingus','Cunnilingus'),
('1hetty','1Hetty','Hetty'),
('lounge-lizard-n','Lounge Lizard (N.','Lounge Lizard (Slang)'),
('m-refers-to-a-marijuana-joint','M Refers to a ''Marijuana'' Joint.','M (Marijuana Joint)'),
('s-anti-lgbt-movement-in-the-united-states','S Anti-LGBT Movement in the United States','Anti-LGBT Movement in the United States'),
('theno-touch-wallflowers','Theno Touch Wallflowers','No-Touch Wallflowers'),
('stammtisch','Stammtisch','Regular Meetup'),
('warm-bruder','Warm Bruder','Gay Man (German Slang: Warm Bruder)'),
('warmer-bruder','Warmer Bruder','Gay Man (German Slang: Warmer Bruder)'),
('kaiser','Kaiser','German or Austrian Emperor'),
('csd','Csd','CSD'),
('csd-related','Csd-Related','CSD-Related'),
('flint','Flint','FLINT'),
('flinta','Flinta','FLINTA'),
('flti','Flti','FLTI'),
('glbt-support','Glbt-Support','GLBT Support'),
('ilga-member','Ilga-Member','ILGA Member'),
('lgtbi-focused','Lgtbi-Focused','LGBTI-Focused'),
('mma','Mma','Mixed Martial Arts (MMA)'),
('ymca','Ymca','YMCA'),
('gnrh-agonists','Gnrh Agonists','Gonadotropin-Releasing Hormone Agonists'),
('gnrh-antagonists','Gnrh Antagonists','Gonadotropin-Releasing Hormone Antagonists'),
('anonym','Anonym','Anonymous Testing'),
('arzt-arztin','Arzt/Ärztin','Medical Doctor'),
('entfesselungskunstler','Entfesselungskunstler','Escapologist'),
('pommes','Pommes','French Fries'),
('intimate-group','Group','Intimate Group'),
('vernetzung','Vernetzung','Community Networking'),
('prejudice','Prejudice','Racial Prejudice'),
('kriegerin','Kriegerin','Female Warrior'),
('anthropologe','Anthropologist','Anthropologist (Profession)'),
('auszeichnungen','Auszeichnungen','Awards'),
('gruppe','Gruppe','Group'),
('queer-kultur','Queer-Kultur','Queer Culture'),
('dragperformer','Dragperformer','Drag Performer'),
('vorurteile','Vorurteile','Prejudice')
), renamed AS (
 UPDATE public.unified_tags u SET name=f.new_name
 FROM fixes f WHERE u.slug=f.slug AND u.name=f.old_name AND u.status='active'
 RETURNING u.id,f.slug,f.old_name
)
INSERT INTO public.tag_aliases(canonical_tag_id,alias_name,alias_slug,alias_type,review_status)
SELECT id,old_name,slug,'spelling_variant','approved' FROM renamed
WHERE lower(old_name)<>lower((SELECT name FROM public.unified_tags WHERE id=renamed.id))
ON CONFLICT(alias_slug) DO NOTHING;

-- Retract namesake text which hid the intended occupational or community sense.
UPDATE public.unified_tags u
SET description=f.description,short_description=f.short_description,
 long_description=NULL,wikipedia_url=NULL,wikidata_id=NULL,description_i18n='{}'::jsonb,
 localisation_review_note='English name and intended sense reviewed against linked source content on 2026-10-10.'
FROM (VALUES
 ('astrolog','An astrologer interprets celestial positions and movements using astrological traditions.','A person who practices astrology.'),
 ('texter','A lyricist writes the words of songs.','A writer of song lyrics.'),
 ('synchron','Dubbing replaces or records spoken dialogue for a film, television programme, or other media production.','Recording replacement dialogue for a media production.'),
 ('flint','FLINT is a community acronym for women, lesbians, intersex, non-binary and trans people.','Women, lesbians, intersex, non-binary and trans people.'),
 ('lounge-lizard','Slang for someone who frequents bars or lounges while seeking romantic or sexual partners.','A person who frequents bars while seeking partners.'),
 ('lounge-lizard-n','Slang for someone who frequents bars or lounges while seeking romantic or sexual partners.','A person who frequents bars while seeking partners.')
) f(slug,description,short_description)
WHERE u.slug=f.slug AND u.status='active';

-- Every pair below was reviewed as the same meaning; no blanket name-based merge.
DO $audit$
DECLARE r record; c public.unified_tags%ROWTYPE; d public.unified_tags%ROWTYPE;
 v_audit uuid; v_categories jsonb; v_expected_links int; v_actual_links int;
BEGIN
 FOR r IN SELECT * FROM (VALUES
('actor','schauspieler'),
('actor','schauspieler-in'),
('author','autor'),
('auszeichnungen','preise'),
('billiards','billard'),
('comedian','komiker'),
('composer','komponist'),
('conductor','dirigent'),
('dancer','tanzer'),
('dragperformer','dragkuenstler'),
('editor','redakteur'),
('equality','gleichstellung'),
('fashion-designer','modedesigner'),
('film-director','regisseur'),
('gonorrhea','gonorrhea-tripper'),
('identity','identitat'),
('literature','literatur'),
('musician','musiker'),
('nun','nonne'),
('performance-artist','performancekuenstler'),
('photographer','fotograf'),
('poet','dichter'),
('police','polizei'),
('priest','priester'),
('publisher','verleger'),
('queer-kultur','queere-kultur'),
('sex-worker','sexarbeiter'),
('singer','sangerin'),
('writer','schriftstellerin'),
('abasiophilia','abasiophillia'),
('caning','caneing'),
('hetty','1hetty')
 ) p(canonical_slug,duplicate_slug)
 LOOP
  SELECT * INTO STRICT c FROM public.unified_tags WHERE slug=r.canonical_slug AND status='active';
  SELECT * INTO STRICT d FROM public.unified_tags WHERE slug=r.duplicate_slug AND status='active';
  SELECT count(*) INTO v_expected_links FROM (
    SELECT entity_id,entity_type FROM public.unified_tag_assignments WHERE tag_id IN (c.id,d.id)
    GROUP BY entity_id,entity_type
  ) expected;
  SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) INTO v_categories
  FROM public.tag_category_assignments a WHERE a.tag_id=d.id;
  -- Preserve the canonical primary filing, retaining the source as secondary.
  UPDATE public.tag_category_assignments a SET is_primary=false
  WHERE a.tag_id=d.id AND a.is_primary AND EXISTS(
    SELECT 1 FROM public.tag_category_assignments ca WHERE ca.tag_id=c.id AND ca.is_primary
  );
  v_audit := public.merge_tag_concept(c.id,d.id,'tags-english-catalogue-audit','reviewed:translation-or-spelling-synonym');
  -- Extend the reversible audit with the full original category rows.
  UPDATE public.tag_merge_audit SET snapshot=snapshot||jsonb_build_object('__original_category_rows',v_categories)
  WHERE id=v_audit;
  -- Earlier translations already created aliases on the duplicate. Move these
  -- aliases and their search synonyms to the surviving canonical vocabulary.
  UPDATE public.tag_aliases SET canonical_tag_id=c.id WHERE canonical_tag_id=d.id;
  UPDATE public.search_synonyms SET tag_id=c.id,replacements=ARRAY[lower(c.name)]
  WHERE tag_id=d.id;
  UPDATE public.tag_slug_redirects SET tag_id=c.id,new_slug=c.slug WHERE tag_id=d.id;
  SELECT count(*) INTO v_actual_links FROM public.unified_tag_assignments WHERE tag_id=c.id;
  IF v_actual_links<>v_expected_links THEN
    RAISE EXCEPTION 'Assignment union changed for %: expected %, actual %',c.slug,v_expected_links,v_actual_links;
  END IF;
 END LOOP;
END $audit$;

-- A source-less, unused label of unknown meaning cannot be an English tag.
-- Preserve its record and audit trail, and remove it from active vocabulary.
UPDATE public.unified_tags u SET status='deprecated',deprecated_at=now(),
 deprecation_reason='English-name audit 2026-10-10: label meaning cannot be established; no definition, source, relationships or linked content. Record retained for recovery.',
 localisation_review_note='Removed from active catalogue pending a source establishing the intended meaning.'
WHERE u.slug='abc-teller' AND u.status='active' AND u.usage_count=0
 AND u.description IS NULL AND u.short_description IS NULL AND u.long_description IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.unified_tag_assignments a WHERE a.tag_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.tag_sources s WHERE s.tag_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.tag_relations r WHERE r.source_tag_id=u.id OR r.target_tag_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.tag_relationships r WHERE r.tag1_id=u.id OR r.tag2_id=u.id);

-- Equal-name aliases add no vocabulary and arose from the merge RPC or
-- the reverted BEGiNE translation. Keep their full records in merge audit
-- before removing them; canonical names and slug redirects retain resolution.
DO $aliases$
DECLARE r record; v_aliases jsonb;
BEGIN
 FOR r IN SELECT id,canonical_id,duplicate_slug FROM public.tag_merge_audit
 WHERE actor='tags-english-catalogue-audit' AND source='reviewed:translation-or-spelling-synonym' AND NOT is_reversed
 LOOP
  SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) INTO v_aliases
  FROM public.tag_aliases a JOIN public.unified_tags t ON t.id=a.canonical_tag_id
  WHERE a.alias_slug=r.duplicate_slug AND lower(a.alias_name)=lower(t.name);
  UPDATE public.tag_merge_audit SET snapshot=snapshot||jsonb_build_object('__redundant_aliases_removed',v_aliases) WHERE id=r.id;
  DELETE FROM public.tag_aliases a USING public.unified_tags t
  WHERE t.id=a.canonical_tag_id AND a.alias_slug=r.duplicate_slug AND lower(a.alias_name)=lower(t.name);
 END LOOP;
END $aliases$;
DELETE FROM public.tag_aliases a USING public.unified_tags t
WHERE t.id=a.canonical_tag_id AND t.slug='begine' AND a.alias_slug='begine'
 AND a.alias_name='Begine' AND a.alias_type='multilingual' AND a.review_status='rejected';

-- Assert the public vocabulary invariants after the reviewed batch.
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM public.unified_tags WHERE status='active'
  GROUP BY lower(btrim(name)),entity_kind HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Duplicate active names remain after English-name audit';
 END IF;
 IF EXISTS(SELECT 1 FROM public.unified_tag_assignments a JOIN public.unified_tags t ON t.id=a.tag_id WHERE t.status<>'active') THEN
  RAISE EXCEPTION 'An assignment points to an inactive tag';
 END IF;
 IF EXISTS(SELECT 1 FROM public.tag_category_assignments a JOIN public.unified_tags t ON t.id=a.tag_id
  WHERE t.status='active' AND a.is_primary GROUP BY a.tag_id HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Multiple primary categories after merge';
 END IF;
END $verify$;
