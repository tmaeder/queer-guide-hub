-- The two-tag half of the news vocabulary-dump retraction.
--
-- 20261007100000 retracted 368 rows and 20261007180000 one more, but both scoped to
-- `cardinality(tags) >= 3` -- chosen because three tags out of a 9,591-slug vocabulary
-- all landing in its alphabetical head is already a vanishing coincidence. That
-- threshold hid a whole cohort. Found by verifying the FIRST retraction on prod rather
-- than trusting it: `ace-of-spades` still showed usage_count = 1, and the survivor was
-- "Black Gay Men Refuse to Carry Shame" tagged ace-of-hearts + ace-of-spades -- the
-- same defect, two tags, invisible to the >= 3 filter.
--
-- 2,488 rows carry exactly two tags; 124 have both inside the first 600 slugs. All 124
-- were read against title + excerpt, and this cohort is NOT like the >= 3 one:
--
--     >= 3 tags   356 junk /  12 partial /  0 correct   (of 368)
--     == 2 tags    85 junk /  25 partial / 14 correct   (of 124)
--
-- 39 of 124 hold at least one defensible tag. At two tags the structural signal is
-- genuinely weaker and the head of this vocabulary is full of ordinary words -- ableism,
-- accessibility, activism, advocacy, art, academic-institution, accents, accomplice --
-- so a rule that emptied every row here would have destroyed 39 correct ones to fix 85.
-- That is why the pattern selects candidates and a human decides, and it is the same
-- reason sortedness was never used: `normalize_news_tags()` sorts every array on write.
--
-- Kept where the article earns it: `ableism` on disability reporting, `accessible-
-- transportation` on a wheelchair user denied boarding, `abstinence-only-education` on
-- purity culture, `ace`/`acespec` on genuine asexuality coverage. Dropped where the tag
-- is the vocabulary talking: `ace` on a piece about the band The Aces, `acolyte` on a
-- Yoruba devotee and a Hindu priest, `abrosexual` on a body-type-preference essay.
--
-- Reuses the audit table the parent created, so there is ONE rollback for the whole
-- retraction across all three migrations:
--   UPDATE news_articles n SET tags = a.tags_before
--   FROM news_tag_vocab_dump_audit_20261007 a WHERE n.id = a.article_id;

-- tags_after goes through normalize_news_tags() rather than being written literally:
-- trg_normalize_news_tags is a BEFORE UPDATE OF tags write-gate ending in
-- array_agg(DISTINCT tag ORDER BY tag), so a hand-written array is rewritten on write
-- and the post-condition below would fail against its own snapshot.
INSERT INTO public.news_tag_vocab_dump_audit_20261007 (article_id, tags_before, tags_after, verdict)
SELECT article_id, tags_before, public.normalize_news_tags(tags_after), verdict FROM (VALUES
  ('cf4583da-1dd8-4a1e-951e-5be5acea5aa9'::uuid, ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('c617340d-dac8-4469-b7ae-72a52605a064', ARRAY['abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('241943a5-3bf8-4609-99dc-265437077767', ARRAY['ableism','accessibility']::text[], ARRAY['ableism']::text[], 'mixed'),
  ('b12c1f89-62d5-44f9-b9b2-4024d9b62552', ARRAY['accents','accessibility']::text[], ARRAY['accents']::text[], 'mixed'),
  ('cf11d857-fdcd-4a08-965b-821431b3aab0', ARRAY['accessibility','accomplice']::text[], ARRAY['accomplice']::text[], 'mixed'),
  ('606d85d8-5766-47c3-a831-6b1104f6f2e5', ARRAY['accessibility','activism']::text[], ARRAY['activism']::text[], 'mixed'),
  ('a6e68b43-1cc4-4a13-822f-80c4e90d3e95', ARRAY['abstinence-based-approach','ace']::text[], '{}'::text[], 'junk'),
  ('19dd578c-1b6a-43a3-9d83-b1a75c1214c3', ARRAY['abasiophillia','abrosexual']::text[], '{}'::text[], 'junk'),
  ('02849948-7c6f-4b88-b28e-98467eeba10c', ARRAY['accessibility','artist']::text[], '{}'::text[], 'junk'),
  ('7d4c8471-0b36-4734-921a-8a34e2f87b9a', ARRAY['accessibility','accomplice']::text[], ARRAY['accomplice']::text[], 'mixed'),
  ('86304d3e-597c-4650-b3b7-347737a5789c', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('7fa35524-1ae4-4a55-a876-844610e2a739', ARRAY['accessibility','allyship']::text[], '{}'::text[], 'junk'),
  ('47c39548-9044-47a5-bbd8-0a968009da6b', ARRAY['abrosexual','abstinence']::text[], '{}'::text[], 'junk'),
  ('65ccd3bf-521b-4229-93d2-0c275f786d9a', ARRAY['academic-institution','accessibility']::text[], ARRAY['academic-institution']::text[], 'mixed'),
  ('460a41f4-0374-4ef3-9efc-2c560da5e3c7', ARRAY['accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('9d6c16cc-8edd-4864-9c1b-4d97920e6cdd', ARRAY['abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('1f56e049-7a4a-497e-86b3-2ed085e478dd', ARRAY['abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('79122be9-dcdf-4278-9d60-9ad56345ef6e', ARRAY['ableism','accessibility']::text[], '{}'::text[], 'junk'),
  ('d9ce1712-0574-49a7-87f3-bb40e3b6e2d2', ARRAY['abrosexual','ace']::text[], '{}'::text[], 'junk'),
  ('24d32ddd-8307-40cf-b685-47911a17765e', ARRAY['abstinence','accessibility']::text[], '{}'::text[], 'junk'),
  ('4eb058a5-efe2-4177-acea-a6653ad2447d', ARRAY['abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('c143665d-eb6e-46c6-aa27-66c4b0abd5f3', ARRAY['ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('6ac4dc9f-f8a5-492d-bd55-4f09826cfe3f', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('d8f3dcac-4f57-490a-a6bf-571b12a6d891', ARRAY['abrosexual','ace']::text[], '{}'::text[], 'junk'),
  ('63a21e9a-86c1-4f28-b4b1-e47c93b9396d', ARRAY['aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('e15bea4b-981a-4052-a23c-3a7005316550', ARRAY['activism','advocacy']::text[], ARRAY['advocacy']::text[], 'mixed'),
  ('0a67f60b-6b49-42c3-9ce6-1106b4ffeb5f', ARRAY['abstinence','accessibility']::text[], '{}'::text[], 'junk'),
  ('85f1d532-ea90-4bb2-bb57-19c4403b6cb3', ARRAY['abrosexual','abstinence']::text[], '{}'::text[], 'junk'),
  ('bdd155cf-8077-4fd1-9162-53ea9e7a7cd6', ARRAY['accessibility','accessibility-features']::text[], '{}'::text[], 'junk'),
  ('493cbd31-532b-4627-8dae-37c1e9a18508', ARRAY['abrosexual','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('7c5993ae-604a-4310-bd61-8d9000f3ec63', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('0502caee-e69d-4960-a392-a062520d2be0', ARRAY['accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('cea1c4dc-3173-469c-82f4-b147c216bee3', ARRAY['accessibility','advocacy']::text[], '{}'::text[], 'junk'),
  ('142b52e3-1855-49f0-a98e-57ebef8f8407', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('00329e25-8b05-414b-97af-9ef3ac7eee57', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('eda72091-cff3-4d10-893e-7471781b6ec8', ARRAY['abroromantic','abrosexual']::text[], '{}'::text[], 'junk'),
  ('7a0f386d-ff2b-48a9-afad-e378fdbe3cfa', ARRAY['ableism','accessibility']::text[], ARRAY['ableism']::text[], 'mixed'),
  ('efe6970d-21dc-41c9-85af-e5edb0f0cbb3', ARRAY['ableism','accessibility']::text[], ARRAY['ableism']::text[], 'mixed'),
  ('9307e71a-4f72-43a3-ba44-44c456115209', ARRAY['ableism','accessibility']::text[], ARRAY['ableism']::text[], 'mixed'),
  ('691a3bc1-424a-4269-8d05-c63fc9de06c0', ARRAY['ableism','accessibility']::text[], ARRAY['ableism']::text[], 'mixed'),
  ('fa17d367-5297-4497-ace7-09eb5976e597', ARRAY['abroromantic','abrosexual']::text[], '{}'::text[], 'junk'),
  ('3701e89d-38fc-4176-9f65-bc4cd8f23074', ARRAY['accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('68779bab-6ff4-4d01-94b6-162d03f78b1a', ARRAY['ableism','accessibility']::text[], '{}'::text[], 'junk'),
  ('1773fd11-06df-4fc9-aaec-105f96995654', ARRAY['abroromantic','abrosexual']::text[], '{}'::text[], 'junk'),
  ('7bbfa7e8-a81d-4b79-bbcd-29ce38476210', ARRAY['abstinence','accessibility']::text[], '{}'::text[], 'junk'),
  ('a2c0dcc1-fd49-4916-9f74-180cba68cea3', ARRAY['accessibility','advocacy']::text[], ARRAY['advocacy']::text[], 'mixed'),
  ('1c7bfd46-e34b-4c82-9b6d-1f0846eeb8de', ARRAY['abstinence','accessibility']::text[], '{}'::text[], 'junk'),
  ('b0a0de65-89ec-4a46-8860-6033f6eefa16', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('328c73e9-4b98-4f14-b523-fbf7db380931', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('2bf98353-3da4-4f85-96fb-0d943ca5ca9f', ARRAY['accessibility','advocacy']::text[], ARRAY['advocacy']::text[], 'mixed'),
  ('a07256df-0a7f-448e-b1e5-75281e66edd6', ARRAY['ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('b194a5a2-da55-466c-99e7-4f141ba37d31', ARRAY['ableism','accessibility']::text[], ARRAY['ableism']::text[], 'mixed'),
  ('269626d9-dba8-4f7d-9ee1-1fe47b57c6f3', ARRAY['ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('11a57e77-c3c4-4510-ae32-5c9527f34342', ARRAY['accessibility','advocacy']::text[], ARRAY['advocacy']::text[], 'mixed'),
  ('74f57596-b5f9-4532-b028-7beb50cbc059', ARRAY['ableism','abstinence']::text[], '{}'::text[], 'junk'),
  ('4b94c553-a634-490d-88b6-d01becabbc77', ARRAY['abroromantic','abrosexual']::text[], '{}'::text[], 'junk'),
  ('8f06dfdd-4470-4b26-883d-0066681af2f8', ARRAY['accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('9ce846ab-66b5-4419-b1e7-0214432d22dd', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('410da3b9-9412-4be9-a184-e4323b42f3ec', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('05ca98a5-c6e4-4505-8c37-048ed3b12809', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('1a90e88e-af88-433f-b618-a86dc526370a', ARRAY['80s-themed','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('97bed9a2-7c34-4553-a648-f0e1aac822e2', ARRAY['abroromantic','abrosexual']::text[], '{}'::text[], 'junk'),
  ('34c46c82-f67c-4dc8-a5d3-0e78d7e76d9c', ARRAY['abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('2429e88d-e639-4e09-a4e8-0c732120aa3d', ARRAY['accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('8264232b-6df9-457d-be3d-7eeaf8bf39d7', ARRAY['accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('0b433eba-61a4-44da-bbdb-c1bbc6ce68a9', ARRAY['abstinence-only-education','accessibility']::text[], '{}'::text[], 'junk'),
  ('25c7a1df-276e-46ba-906f-ab33f105d810', ARRAY['ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('cb8548c1-b523-419d-8029-2789c137cd33', ARRAY['ableism','accessibility']::text[], ARRAY['ableism']::text[], 'mixed'),
  ('870448ed-c274-41dc-acbb-4ccb2db75b4e', ARRAY['academic-institution','accessibility']::text[], ARRAY['academic-institution']::text[], 'mixed'),
  ('cff3c71f-5aed-4843-9a1a-1cf930576ffb', ARRAY['abroromantic','abrosexual']::text[], '{}'::text[], 'junk'),
  ('8f191f14-8805-4b42-a6c7-2eb6805feb1e', ARRAY['abstinence','abstinence-based-recovery']::text[], ARRAY['abstinence-based-recovery']::text[], 'mixed'),
  ('0c7bc265-2a72-40e0-9f7d-95be818c5873', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('46f77ee7-761f-4f3c-8c30-9a53e3ce4559', ARRAY['ableism','accessibility']::text[], ARRAY['ableism']::text[], 'mixed'),
  ('4460a203-e898-4a49-8a25-fc920a49cfc8', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('e8efaf94-989c-4054-86f9-a674683d592b', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('16bdd93a-6f5b-4da2-9f20-9da704aec818', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('69594ad6-1aa2-4701-aa58-a90e99164921', ARRAY['abstinence','accessibility']::text[], '{}'::text[], 'junk'),
  ('fbe3d34c-820c-48eb-b056-f02267e393c9', ARRAY['ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('f2f85d24-8c39-4796-a307-20662fd72527', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('a2915b41-a493-40f6-b9c9-8328f7ff5b6f', ARRAY['ableism','accessibility']::text[], ARRAY['ableism']::text[], 'mixed'),
  ('af80c0b2-b143-4f34-9b6a-e743c60fdd56', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('fb9f7165-a4aa-48b0-bd79-451b562e8c8f', ARRAY['ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('dd367c1b-5189-446e-a2a6-c145b7039031', ARRAY['abroromantic','abrosexual']::text[], '{}'::text[], 'junk'),
  ('55511a51-9497-42f8-9a85-1106ffd20fa8', ARRAY['abstinence-based-approach','abstinence-only-education']::text[], '{}'::text[], 'junk'),
  ('e0cf2c53-248a-444b-af1a-d33cefef3e2c', ARRAY['abstinence','abstinence-based-approach']::text[], '{}'::text[], 'junk'),
  ('602d21fc-8c0b-4600-a3fd-7dd9faa0ba64', ARRAY['accessibility','ace']::text[], ARRAY['accessibility']::text[], 'mixed'),
  ('35360c22-61b6-4ef5-9766-7c45fb6d0557', ARRAY['abstinence','ace']::text[], '{}'::text[], 'junk'),
  ('a4ff1271-0dc5-4284-a6aa-87a53088f1f5', ARRAY['accessibility','art']::text[], ARRAY['art']::text[], 'mixed'),
  ('e7ab13dd-c9a9-4cdb-9122-9a9e7cfac705', ARRAY['ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('5b3950a3-ea4c-427c-bb78-a4ecc2583c27', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('71ce75f4-d9e8-461b-871c-8e8d736ca9a8', ARRAY['accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('18db1b47-e550-48f2-87a5-ec6ad54e8fec', ARRAY['abrosexual','ace']::text[], '{}'::text[], 'junk'),
  ('8851570b-60c5-42ff-94eb-5cd4f90c5737', ARRAY['abrosexual','ace']::text[], '{}'::text[], 'junk'),
  ('682c2b20-f782-4d4f-b038-c52092ac22a8', ARRAY['ace','acespec']::text[], '{}'::text[], 'junk'),
  ('72c4a139-2dda-4cdc-adb7-7a6fb39543c8', ARRAY['abstinence','accessibility']::text[], '{}'::text[], 'junk'),
  ('2aa6b173-9423-46ea-8ad4-8d69a618482d', ARRAY['ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('0fc04f6e-1740-481e-9c3b-96b753a8ea0a', ARRAY['accessibility','activism']::text[], '{}'::text[], 'junk'),
  ('d637a3bc-ccec-494a-b946-bb48e0eff634', ARRAY['abroromantic','abrosexual']::text[], '{}'::text[], 'junk'),
  ('eae5ab00-4066-4658-9f21-971d7a017323', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('e4cd28c4-ddf6-44e2-9907-218d9126ba33', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('9c00da4f-8011-48f6-9f05-28c1776a6169', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('b86425d8-3f8f-479f-9cd8-cda7dd92358c', ARRAY['ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('b6b6c468-b9af-42da-8530-a60084fd7e83', ARRAY['accessibility','activism']::text[], ARRAY['activism']::text[], 'mixed'),
  ('0d53cc47-ba55-45e0-8ac0-c3825e5d4260', ARRAY['abroromantic','abrosexual']::text[], '{}'::text[], 'junk'),
  ('31cf4b71-8a34-4f5a-a741-8a5ba6ac4bda', ARRAY['academic-institution','accessibility']::text[], ARRAY['academic-institution']::text[], 'mixed'),
  ('9bcdf895-09b1-4e8a-b9d0-0a1991434f0e', ARRAY['abroromantic','abrosexual']::text[], '{}'::text[], 'junk'),
  ('5a0dfe9f-88b9-4647-970b-86599d8ee61c', ARRAY['abstinence','abstinence-based-approach']::text[], '{}'::text[], 'junk'),
  ('c43fce86-be43-4d4c-8928-393c7afc9304', ARRAY['accents','accessibility']::text[], ARRAY['accents']::text[], 'mixed'),
  ('3d805a7f-2044-4b12-b4f2-8202aa8531f6', ARRAY['abrosexual','ace']::text[], '{}'::text[], 'junk'),
  ('2cffbd7b-8229-4fdf-8658-284e6532b7fb', ARRAY['abstinence','accessibility']::text[], '{}'::text[], 'junk')) AS v(article_id, tags_before, tags_after, verdict)
-- A row already audited was dispositioned by an earlier migration in this series; its
-- decision stands.
ON CONFLICT (article_id) DO NOTHING;

-- Abort if the corpus moved: a row whose current tags no longer match what was reviewed
-- carries a newer decision, and overwriting it would discard someone's work.
DO $$
DECLARE v_drift int;
BEGIN
  SELECT count(*) INTO v_drift
  FROM public.news_tag_vocab_dump_audit_20261007 a
  JOIN public.news_articles n ON n.id = a.article_id
  WHERE n.tags IS DISTINCT FROM a.tags_before
    AND n.tags IS DISTINCT FROM a.tags_after;
  IF v_drift > 0 THEN
    RAISE EXCEPTION 'two-tag vocabulary-dump retraction: % rows drifted since review; re-run the classifier', v_drift;
  END IF;
END $$;

UPDATE public.news_articles n
   SET tags = a.tags_after
  FROM public.news_tag_vocab_dump_audit_20261007 a
 WHERE n.id = a.article_id
   AND n.tags IS DISTINCT FROM a.tags_after;

-- run_tag_assignment_reconcile is INSERT-only (ON CONFLICT DO NOTHING) and never
-- deletes, so clearing the text does not retract the edges it already minted.
DELETE FROM public.unified_tag_assignments ta
 USING public.news_tag_vocab_dump_audit_20261007 a
 WHERE ta.entity_type = 'news'
   AND ta.entity_id = a.article_id
   AND NOT EXISTS (
     SELECT 1
       FROM unnest(a.tags_after) AS t
       JOIN public.unified_tags u
         ON lower(u.slug) = lower(trim(t)) OR lower(u.name) = lower(trim(t))
      WHERE u.id = ta.tag_id
   );

WITH counts AS (
  SELECT tag_id, count(*) AS n
    FROM public.unified_tag_assignments
   WHERE entity_type <> 'tag'
   GROUP BY tag_id
)
UPDATE public.unified_tags t
   SET usage_count = coalesce(c.n, 0)
  FROM (SELECT t2.id, c2.n FROM public.unified_tags t2
          LEFT JOIN counts c2 ON c2.tag_id = t2.id) c
 WHERE t.id = c.id AND t.usage_count IS DISTINCT FROM coalesce(c.n, 0);

DO $$
DECLARE v_left int; v_edges int;
BEGIN
  SELECT count(*) INTO v_left
  FROM public.news_tag_vocab_dump_audit_20261007 a
  JOIN public.news_articles n ON n.id = a.article_id
  WHERE n.tags IS DISTINCT FROM a.tags_after;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'two-tag retraction did not apply to % rows', v_left;
  END IF;

  SELECT count(*) INTO v_edges
  FROM public.unified_tag_assignments ta
  JOIN public.news_tag_vocab_dump_audit_20261007 a ON a.article_id = ta.entity_id
  WHERE ta.entity_type = 'news'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(a.tags_after) AS t
        JOIN public.unified_tags u
          ON lower(u.slug) = lower(trim(t)) OR lower(u.name) = lower(trim(t))
       WHERE u.id = ta.tag_id);
  IF v_edges > 0 THEN
    RAISE EXCEPTION '% orphaned tag assignments survived the two-tag retraction', v_edges;
  END IF;
END $$;
