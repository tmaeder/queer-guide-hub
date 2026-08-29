-- news_articles.tags: retract 368 rows that carry a slice of the tag VOCABULARY
-- instead of tags about the article.
--
-- WRITER (fixed in the same PR, supabase/functions/{pipeline-quality-enhance,
-- news-quality-backfill}/index.ts): both built their LLM candidate pool with
--     supabase.from('unified_tags').select('slug').limit(200)
-- -- no order, no status filter. Verified on prod, Postgres serves that limit from
-- unified_tags_slug_key (Index Only Scan), so "200 arbitrary tags" was in fact the
-- first 200 slugs ALPHABETICALLY. QUALITY_SYSTEM_PROMPT then instructs the model to
-- "prefer existing tags listed in user message", and it did: articles about the
-- Mormon church, the Oscars, an NBA obituary and a murder investigation all came
-- back tagged from the ab*/ac* region -- abroromantic, abrosexual, ace-of-spades,
-- acolyte, abasiophillia, and on one news story about a couple found dead in a mass
-- grave, the kink term abduction-play.
--
-- DETECTION is structural, CONFIRMATION is semantic. The structural signature is that
-- every tag on the row falls inside the alphabetical HEAD of the vocabulary, which is
-- what a page-of-the-vocabulary looks like and what real tagging never looks like.
-- Measured over the 9,591-slug vocabulary, rows with >=3 tags all resolving to
-- unified_tags fall into: 368 with every tag in the first 100 slugs, then a cliff --
-- 2 in ranks 101-250, 6 in 251-600, and 1,254 spread across the vocabulary. Sortedness
-- was NOT used as a signal and must not be: normalize_news_tags() ends in
-- array_agg(DISTINCT tag ORDER BY tag), so EVERY news tag array is sorted and same-
-- initial+sorted has confirmed false positives ("Asexual and Aromantic History"
-- legitimately carries ace/aromantic/asexual).
--
-- All 368 were then read by hand against title+excerpt. 356 had no defensible tag and
-- are emptied; 12 keep the subset the article actually supports (ace/acespec on genuine
-- asexuality coverage, abstinence on a celibacy memoir, academic-institution on a
-- university lawsuit, 80s-themed on an 80s series). NONE survived intact.
--
-- REVERSIBLE: every prior array is snapshotted below.
--   UPDATE news_articles n SET tags = a.tags_before
--   FROM news_tag_vocab_dump_audit_20261007 a WHERE n.id = a.article_id;
--
-- run_tag_assignment_reconcile is INSERT-only (ON CONFLICT DO NOTHING) and NEVER
-- deletes, so clearing the text does not retract the graph edges it already minted --
-- 1,052 unified_tag_assignments rows. They are deleted explicitly here; leaving them
-- would keep the junk live on every tag page while news_articles.tags looked clean.

CREATE TABLE IF NOT EXISTS public.news_tag_vocab_dump_audit_20261007 (
  article_id  uuid PRIMARY KEY,
  tags_before text[] NOT NULL,
  tags_after  text[] NOT NULL,
  verdict     text   NOT NULL CHECK (verdict IN ('junk','mixed')),
  retracted_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.news_tag_vocab_dump_audit_20261007 IS
  'Snapshot of news_articles.tags before the 2026-10-07 vocabulary-dump retraction. Only copy of the prior arrays.';

-- tags_after is passed through normalize_news_tags() rather than written literally.
-- trg_normalize_news_tags is a BEFORE UPDATE OF tags write-gate that ends in
-- array_agg(DISTINCT tag ORDER BY tag), so a hand-ordered keep list is rewritten on
-- write and the post-condition below would fail against its own snapshot. Asking the
-- gate is also the only collation-correct way to predict the stored order.
INSERT INTO public.news_tag_vocab_dump_audit_20261007 (article_id, tags_before, tags_after, verdict)
SELECT article_id, tags_before, public.normalize_news_tags(tags_after), verdict FROM (VALUES
  ('b68d3362-9ee7-4d2c-9180-30338be1405d'::uuid, ARRAY['ace','ace-of-hearts','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('0dcb9bda-6110-4fec-9c0c-e796a53addb7', ARRAY['abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('01b38451-cbc9-466e-89db-a2a4934bb2f4', ARRAY['ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('016a0802-d653-4d3f-883b-804c3974b311', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('1fbe3810-ffd7-4d1a-bd7d-53f03324e16e', ARRAY['abrosexual','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('c87a384a-c6f8-456d-b2dd-436cd3491903', ARRAY['abrosexual','abstinence','abstinence-based-approach','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('d67b74b7-4c37-4b71-97f6-5f33449fe50e', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('f66a42f5-9df3-4cbd-ac10-63508e94144f', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('6ef12b90-df34-4faa-ba43-deba9e7c01aa', ARRAY['abasiophillia','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('26016e6d-b8d5-41c1-bc0b-c7b2f434da7e', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('7b7e3d64-9de1-4e2b-ab95-c281b821c82f', ARRAY['ace','ace-of-hearts','ace-of-spades','acolyte','act-up','act-up-aids-coalition-to-unleash-power']::text[], '{}'::text[], 'junk'),
  ('2a24df8b-5b5d-4772-bf38-a6f545fe6233', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux']::text[], '{}'::text[], 'junk'),
  ('0924560c-3432-4689-92ce-6d653f96448e', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('65bd7464-c4f6-490d-915e-c38856af3b28', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades']::text[], '{}'::text[], 'junk'),
  ('704f1c59-d3d4-4a21-bf09-5518362e5ce3', ARRAY['ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('11dce57f-c2f4-4402-bd5a-e1be9aff829e', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('9f242208-c05a-4612-af76-725da91a69e0', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('fbd57480-de03-422c-a5fa-6091af955dfb', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('2fbce998-3ab9-49a6-ba08-4c54568d435e', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('ec8a3586-110d-4f05-9bb6-18ea0b40ffc9', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('3da19b3d-007f-424d-b5e4-2096462281e6', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('8ed60e94-63c6-440c-bb74-d90e811468f6', ARRAY['abasiophillia','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('c69d8d65-afde-4292-8e79-88e2d09875aa', ARRAY['abrosexual','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('570751dc-537b-4bf0-b742-5e4e95ba9945', ARRAY['abroromantic','abrosexual','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('9089366d-86fe-46bb-b909-9be8c7f563cc', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('5252f5f8-3c93-40da-90fd-17a367f7465d', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('335b4a95-e8b9-4575-9ccb-03609a4e0eb9', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('696c93e2-3cb5-4666-8c2a-753b25a1003b', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('6f9fef51-c5a9-4447-a9ee-c1e8aed87913', ARRAY['accessibility','ace','acespec']::text[], ARRAY['ace','acespec']::text[], 'mixed'),
  ('80cf1319-05e9-4135-a47c-97b77a01969d', ARRAY['abrosexual','ace','acespec']::text[], ARRAY['ace','acespec']::text[], 'mixed'),
  ('da2ff061-40ce-4e4d-8777-e9ecda218a06', ARRAY['abroromantic','abrosexual','ace','acespec']::text[], ARRAY['ace','acespec']::text[], 'mixed'),
  ('16cf0f91-522f-48ef-badb-3ff62153e80d', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('864a1ff7-ba40-40c3-8bfa-bba9af3faa58', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('c624fbc5-9319-4af5-a07b-e6c20adba2d8', ARRAY['accessibility','ace','ace-of-hearts','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('d8b24bce-4afd-42de-a640-0d0925da2c04', ARRAY['accessibility','ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('d1e69537-ce63-4075-91ca-168643c4f17e', ARRAY['abrosexual','abstinence','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('7fda190c-e2da-49f7-9835-a4453b05c7b5', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('10fdc020-a768-4e39-8416-55c9f8fad109', ARRAY['accessibility','ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('0ebf2475-e63a-4464-b8c6-cd7f3028d416', ARRAY['abroromantic','abrosexual','accessibility','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('8b1e8661-0a2c-43a3-8ff2-89dbcc062fd1', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('43befeae-e450-4a74-a8ac-6e336b5d5b1d', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('8beb9fa4-0977-47de-83f2-441b0ad44be5', ARRAY['abrosexual','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('36c76e55-0b06-4fe2-ad43-3103a6b16008', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('07e0dfbf-0e79-4d19-a0c3-2f4d4bcd1ee6', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('49f0dd6a-2cc7-46c1-87d3-77eac0c483d0', ARRAY['accessibility','ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('de0af08f-499a-474f-9e20-7e863481514a', ARRAY['accessibility','ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('96029773-6671-4f61-a7f5-2a14f96d8b23', ARRAY['abrosexual','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('1367b1e6-455d-4742-952e-4670b7c6c603', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('abd0430b-c28e-4ac5-82c1-27e55e19ea52', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('8b33b237-4d46-4b56-b6cd-7cafe6d0f53f', ARRAY['abstinence','ace','aceflux']::text[], ARRAY['abstinence']::text[], 'mixed'),
  ('b81550ce-a4d6-4940-88d2-5ba034531dde', ARRAY['abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('edb940e4-5eed-4e45-8647-ee5044d2b96b', ARRAY['abrosexual','accessibility','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('cec5a520-fec3-40be-b7e2-ec2a8c38ae49', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('1d473165-e136-4bf4-aa6a-1e356c05301e', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('c4a04b33-1af6-47b2-b22e-d2dda3100c7d', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('a0f5d07e-3a40-4e21-9628-3e20da748698', ARRAY['abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('d1a52fbb-03cc-4953-9176-24a704a4cd0b', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('53fcae4b-448c-4e8b-ba79-810531dacdd7', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('6e29026b-ab0f-4bc0-a8e6-9e71f5f21ec0', ARRAY['accessibility','ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('4c125104-9eee-4b6b-b570-1a468d473571', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('fba9967d-43a4-4db9-840d-882ccf701645', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('83d4337e-79b4-43dc-aa82-3e14beb375d9', ARRAY['accessibility','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('1413ab5f-e1c2-45bf-befe-af3e7d81c2aa', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('bae1da78-1f94-43f7-8e3a-d1e1bc3da741', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('329f9d30-1d93-464d-b038-bb4e325a43f2', ARRAY['accessibility','ace','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('ed57d5e1-2be9-4482-b966-634195fb4449', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('a8f76eed-8c0b-4222-a386-0ee37eee9cd6', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('b59f5956-f10a-434e-a0ae-b412bd96721e', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('d3a56dc0-707b-4f38-82a1-04a9eb2a305d', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('0622ab4f-634f-4dce-8435-9aeeff9cd2e9', ARRAY['abrosexual','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('9e00d8b9-850f-4991-bb38-5dc368eb903d', ARRAY['accessibility','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('12d493f2-1539-437a-b3a2-43b25ac505b3', ARRAY['ace','ace-of-hearts','aceflux']::text[], '{}'::text[], 'junk'),
  ('3280aa5a-4fcd-49df-a2bd-94d190fc4e11', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('c02ef213-6b3d-4fc2-82a8-4ce42983c964', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('11794bf9-9d63-47d8-8f97-8feca3b1776f', ARRAY['accessibility','ace','ace-of-hearts','aceflux']::text[], '{}'::text[], 'junk'),
  ('aed46b70-938c-4c3b-9da5-8eef181add7b', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('4759d973-f6b4-44bd-99fd-20edbac47255', ARRAY['abrosexual','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('157f1849-022a-448d-aa83-5f157b0daa86', ARRAY['abasiophillia','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('59aa5288-aba5-4765-a35f-afc50d1f17ac', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('90b51c01-ba07-48fc-8bd1-dd99087d6a9d', ARRAY['abroromantic','abrosexual','ace','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('3d868dcd-a137-4a35-b6bf-e62f0b00257e', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('6eb93cc6-7c9f-4704-ade6-7a7d878419d5', ARRAY['ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('1bea7ea9-d53e-4186-8c06-3a3e02887bc0', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('61ef093b-a4dc-4fe5-9986-6cf669523d5f', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('a0bbeade-dd23-45b3-a67f-6e27ac19fbd8', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('13c01119-e2d1-4871-a596-0b1d7aaf6a74', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('b19e0663-2218-4e7e-9fc6-2d70948bbf7f', ARRAY['accessibility','ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('326e9bbd-9ca2-43e4-8508-70969e033f25', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('19ef01f9-c570-468d-a28b-6300e243ea96', ARRAY['abrosexual','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('7a458861-7ffd-4925-b915-a131d068f473', ARRAY['accessibility','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('735564f8-b742-4152-8ed1-57ba637f1bb1', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('bcb6d477-82a6-4107-8b46-5c49c9613b47', ARRAY['accessibility','ace','ace-of-hearts','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('cecd341f-cce8-40cc-8ed0-c4cf0e5a5925', ARRAY['accessibility','ace','ace-of-hearts','aceflux']::text[], '{}'::text[], 'junk'),
  ('fd7211ca-c330-4483-ba60-3da60a6b5c4d', ARRAY['abstinence','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('bb2a2f45-8391-4cc2-9d09-d91188b4a4af', ARRAY['ace','ace-of-hearts','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('ffe404e1-8fa3-4367-a290-6f12bd6c984b', ARRAY['accessibility','ace','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('c54d635e-025f-4500-b20a-84929bd02b01', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('613440b5-1930-4718-ab1c-938a44e07cd5', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('66c2ec11-ab06-426f-86f5-f425e92e9b1c', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('a1fe7f34-578a-4dec-9ba9-3e2abcded4e2', ARRAY['abroromantic','abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('5889fbe8-116d-42ee-88ee-bd1ed7cd6717', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('a0c80e3c-bbe6-4468-96b8-8462ba4ad5fd', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('4fa256e2-be4e-4a0f-b9c7-5712a0df0cbd', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('cbaf8c0f-f9d7-4ebd-ac4b-e07fa449d34f', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('84cec381-937f-4976-8d7a-a136178a968e', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('d84afb3b-7f00-4916-b509-8b8a4a436b15', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('7de23a9e-1be5-4987-9b46-110b4442c600', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('1bf88643-0c45-4a7e-816c-435c63dccdd7', ARRAY['accessibility','ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('cfb6c4c7-52bf-432a-a34f-cda5a7c54b37', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('8e5c1c7d-8c72-4502-8beb-22c2a8a9e583', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('97dcb48a-b2db-44b9-94dd-f8ec37dfc9f5', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('2e6a83ce-5754-4360-8a0f-851b1f6fa922', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('6770bf9f-0ab4-4f10-96f6-b12b0461f8b7', ARRAY['abrosexual','accessibility','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('a671b561-fd21-4006-b1d9-0d9867ace3ae', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('76ab72be-0050-430c-8814-87ea6bdfab0f', ARRAY['accessibility','ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('e96ab5bb-33c8-448e-ba2e-028fca68603e', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('af400dd3-e3d9-4ec8-a054-cbe252cee019', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('a8eeb0d5-feda-454c-9e95-5d4c469953fe', ARRAY['abduction-play','abroromantic','abrosexual']::text[], '{}'::text[], 'junk'),
  ('ca76a0d4-1b21-4f76-98d2-aab52e92806d', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('5c8ee214-c0e8-4ebd-87f2-4130685f2a05', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('5e372f5d-766a-42b5-b242-a90551b0a218', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('a0fd053e-9c58-40ba-b9e3-a9392515e9b4', ARRAY['ace','ace-of-hearts','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('dfb68ade-c290-44d1-8d6b-fe6eb269ae9b', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('4e0714d4-7c9f-40ea-acc1-aa29c4c4db7a', ARRAY['abrosexual','accessibility','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('625c65e8-3217-4a68-9dd1-e1d4b4d2ebdf', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('97463564-1137-463a-b53c-60099c30d546', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('1b24db2d-bed4-4d40-9cf1-7382f01b03ec', ARRAY['80s-themed','accessibility','ace','ace-of-hearts']::text[], ARRAY['80s-themed']::text[], 'mixed'),
  ('79e196be-567f-4b3a-b8fd-3e555bf53ea0', ARRAY['accessibility','ace','ace-of-hearts','aceflux']::text[], '{}'::text[], 'junk'),
  ('3a60b6b1-b721-496e-949a-100c2678211c', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('7e46d29f-0baf-4b0b-af8a-860eac1cfc20', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('c3a5d85c-722f-4c18-9c1a-fe3a3ad27765', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('c259037d-3e52-4ba9-adab-7e93b7c50b18', ARRAY['accessibility','ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('04064b8f-3b4c-48c1-a60b-17d320233710', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('52583399-619b-4a37-a82e-1e67f1f35e22', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('11eae8da-09b2-4d68-939d-67203800c348', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('fb159f00-6e0d-4f9e-a56d-ca8f07caf235', ARRAY['abrosexual','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('7cd7e4b5-4f96-45d3-a353-ebfaf1d16cc4', ARRAY['abrosexual','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('39972978-e1f6-483c-8546-ea3607d10563', ARRAY['abrosexual','abstinence','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('236d3e09-0baf-4ec7-9f4d-f8b30c5d65a1', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('9c41b5b4-eda3-40b4-b670-e1de2fe7a557', ARRAY['abstinence','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('7bd4809b-0ffe-46fa-8801-38dd9c576c6f', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('b20ba933-9b7e-49d3-b8b9-a3e7792df3ac', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('95875bcc-032d-4b43-b5bd-4dd0f01d60cd', ARRAY['ace','ace-of-hearts','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('37949598-3006-4e41-b51a-fe37de763a4f', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('74a77619-24c3-40fb-9422-fe2220c4f4a0', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('47869efc-c677-4029-9532-b6cf100aee83', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('9c057533-ca7e-45b9-a291-56e7c318b053', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('8757ee62-3ae0-42f3-b0fb-ddd2cb1e7e9a', ARRAY['accessibility','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('c2ad21b3-64d9-46fd-9147-249c0c769677', ARRAY['accessibility','ace','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('af04af2c-80a3-4474-9bd5-5e568a36cf21', ARRAY['abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('e95fa331-0041-4bff-b31f-e4a5659a550c', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('e10d3f9b-a1f4-4755-98ac-e479fa2108b4', ARRAY['abrosexual','abstinence','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('bddbfbb5-5eaa-4d54-97ec-0f5c8788a699', ARRAY['accessibility','ace','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('94861ab6-2982-4426-a25c-6d546b311e06', ARRAY['abroromantic','abrosexual','accessibility','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('ab71c0f7-63e1-4f97-a410-f6143a6db367', ARRAY['abroromantic','abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('0d6d1bfe-2da2-42d0-9834-716662b20127', ARRAY['accessibility','ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('aba6461c-7070-4366-b54a-9dba159f1591', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('94de92c4-2a0c-4e43-b15e-c4115b8d4dca', ARRAY['abroromantic','abrosexual','ace','aceflux','aces-in-relationships','acespec','acolyte']::text[], '{}'::text[], 'junk'),
  ('f59f2951-815d-4732-8093-dd8b240f1c73', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('2ffac9eb-f3c5-4594-bb77-fb22adfe5871', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('770f6931-fbea-4c64-a5ca-2aed2344273d', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('ade02ac9-31b2-4713-adec-b125c15e0b2e', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('4daaf716-e805-4215-af64-fed851fc69c5', ARRAY['abroromantic','abrosexual','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('40b3c496-953f-437d-841c-212af2d43e37', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('2c87ccdc-d15f-4508-90c9-92fc7dd5db12', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('9560aba2-2f56-45e7-92ec-52936c237b99', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('36f4c502-e1d6-4969-9a19-51de406475e7', ARRAY['abrosexual','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('df7f9802-bbe3-44c7-a558-7585b842dbe6', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('e7559bc9-4acb-4da6-8f89-a2aecbc37302', ARRAY['abstinence','abstinence-based-approach','abstinence-based-recovery','academic-institution','ace','aceflux','aces-in-relationships','acespec']::text[], ARRAY['academic-institution']::text[], 'mixed'),
  ('4060eaa7-378e-4e79-9098-c1460472a8ef', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('e78af538-0feb-4a71-bcd9-51ef4a1dccc7', ARRAY['abroromantic','abrosexual','ace','ace-of-hearts','ace-of-spades','aceflux','aces-in-relationships','acespec','acolyte']::text[], '{}'::text[], 'junk'),
  ('370f507c-bea0-4a1b-9398-39d4f89879aa', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('1af71148-b8ac-4324-92cb-089e7992fa19', ARRAY['ace','ace-of-hearts','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('ca7e81d5-7f55-4f5e-8f79-8dc0ab6b695d', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('eca19571-da2c-4774-bb4d-05cd690a974a', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades','aceflux','aces-in-relationships','acespec','acolyte','acoustics']::text[], '{}'::text[], 'junk'),
  ('1dcf8ec4-a5c5-4cc0-893d-2f2e99049a23', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('36e5425e-70ac-4650-bd21-fc920944f658', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('1cf953e8-4a34-4f27-ab0e-4e6b13de2dce', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('abd19ced-ff19-416e-ab1b-942e5f1d7471', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('1d19490b-0f41-43b0-9276-a093042aa323', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('b42eb9fe-ea0d-4342-b7b0-7db761be99ca', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('a0d40c21-7663-4e10-bb86-539941c329db', ARRAY['abroromantic','abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('5d7ef111-070e-4529-9ab2-622871d40ef7', ARRAY['abroromantic','abrosexual','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('1e780641-3d5a-4588-af89-93cbf9938154', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('70ec32ca-c3c3-4bfb-bb75-a1314e32a15e', ARRAY['accessibility','ace','ace-of-hearts','aceflux']::text[], '{}'::text[], 'junk'),
  ('1fd659d2-6663-40e3-9cf8-a5a3890fca18', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('001890ec-22e4-4403-becf-958f84022f1e', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('b95b6ba0-a7f6-43cc-bd56-45ee5c03464e', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('2d68ede9-2af7-4a14-9f3e-7c9b1e8f5211', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('8bf488bd-2f97-4810-9b23-21a72595d096', ARRAY['abrosexual','abstinence','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('068a0426-8531-42d9-875a-fa45008ef0fd', ARRAY['ace','aceflux','acolyte','acoustics']::text[], '{}'::text[], 'junk'),
  ('ea865924-89d1-4abd-8021-4a8f80d4adfe', ARRAY['accessibility','accessibility-features','accessibility-measures','accessibility-tools']::text[], '{}'::text[], 'junk'),
  ('d6556539-f12e-46ea-a06a-302a7c589e10', ARRAY['accessibility','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('c5d5f401-6923-4e30-9be1-44ecb7a0c713', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('90eac838-b6f9-405f-9f5f-fa7486b02415', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('e900f4ba-7827-4815-bae4-3fdab6b7b64d', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('e6ea1a30-7139-44e5-8647-951021ebd231', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('33d43596-bf48-4fc0-92e5-cced18e8400f', ARRAY['abroromantic','abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('9b4fdee9-6d5d-46d6-ab20-96bd7e2a93ba', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades']::text[], '{}'::text[], 'junk'),
  ('62543bb8-d00c-453d-939f-c45a7238cf4b', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('4d3e8bfb-b861-4784-ae2f-e39a18f9dff9', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('ac63151c-6bf6-4ff6-8dfc-2ae7a7891d67', ARRAY['abasiophillia','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('8144f73c-c697-4a7d-acf5-20db241ab231', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('9f2bba98-91b8-4d97-88ea-70d473c45d47', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('6d9b75d9-ea44-42b7-b993-eddfd4333dc4', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('796d1398-c40c-4ff4-a0ab-d5c513fd6247', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('18d1ca4f-9549-4672-a19e-ab8d57ef607c', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('93271135-e305-49a7-b317-d01e97b00cf3', ARRAY['ace','ace-of-hearts','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('4d922bc6-c235-45e8-a8c1-9a13232f9422', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('e0c183f5-8b34-4a44-8879-c1b44f5cfe2c', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('31fb7bc8-4bfd-4be8-b9e3-ce8d5e4f4c8a', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('658b9008-622b-4e3d-bb7f-fe2bcaac4955', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('7068b5e7-f989-4356-a5ae-2fa19fd49b4f', ARRAY['abroromantic','abrosexual','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('c3233df3-1d9e-49ee-862b-f210321989a8', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('f4f9c784-d897-4ec6-a0c7-538498e84413', ARRAY['ace','ace-of-hearts','aceflux']::text[], '{}'::text[], 'junk'),
  ('b97332d4-e990-4b64-a2d8-bc95fdb6a437', ARRAY['ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('ad1447cc-11e9-4d00-aeb3-88f1cae88b45', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('5440fefc-d722-462a-9af0-e2eaf866f53f', ARRAY['ace','ace-of-hearts','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('89ccbd45-84cd-40e1-958a-2d8d880cc00e', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('bd467a9f-7d53-4c2f-a39b-dd24805131ab', ARRAY['ace','ace-of-hearts','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('84d403d8-a920-451d-b5a1-bf6b8b339454', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('07d6860f-804d-45a3-aef7-19746521aaab', ARRAY['abroromantic','abrosexual','ace']::text[], '{}'::text[], 'junk'),
  ('86348ac3-416e-4b90-a616-0d6d2258bd21', ARRAY['abstinence','abstinence-based-approach','accessibility']::text[], '{}'::text[], 'junk'),
  ('74387c15-1a03-431c-8fb1-fac6e0b8b553', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('39bba94c-2c5c-440b-b830-341cbd9da830', ARRAY['abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('32266146-2433-48f9-98e8-139a868ea4ce', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('7a9aa4cf-d744-4d93-9820-14a397609122', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('34d44723-02d5-4bc2-a140-a1a588066816', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('0b2e5e25-1f4f-4b91-b046-d3b098b0899d', ARRAY['accessibility','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('2b58a386-c686-4edd-80b1-151a17afb785', ARRAY['abroromantic','abrosexual','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('46421548-584e-4413-b765-2841b04296c6', ARRAY['abroromantic','abrosexual','ace','aceflux','aces-in-relationships','acespec']::text[], ARRAY['ace','acespec','aces-in-relationships']::text[], 'mixed'),
  ('abe13601-2531-4300-a4b2-919f57d51a2e', ARRAY['abrosexual','accessibility','ace']::text[], ARRAY['ace']::text[], 'mixed'),
  ('b5927851-a5cf-4e25-9616-c4606952ec3c', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('671cdf67-ca8a-4e66-8b75-0ce9bd014317', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('d61cc0f5-7144-4bb8-ba95-ab3e4d378646', ARRAY['abstinence','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('540a841d-e1bb-474a-9f57-c036ccf68b5a', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('a1326287-836b-4286-8843-65d748835ef0', ARRAY['abroromantic','abrosexual','ace','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('d7a445f6-7e04-404d-99dd-299e16505960', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('b9009980-fb73-4b15-b607-83a5a10bfd0a', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('4e1e6c16-b33d-4a97-a2a7-af3d23e46fc5', ARRAY['accessibility','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('bc87fd25-7f52-44b4-9c67-31e3dbc26f93', ARRAY['abroromantic','abrosexual','accessibility','ace','acespec']::text[], '{}'::text[], 'junk'),
  ('c48183a1-e03e-4cdc-a5bf-34730d452261', ARRAY['accessibility','ace','ace-of-hearts','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('fa60d2ed-29bb-4fa9-8a34-52194bf9d54c', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('0c84e3bd-1df7-4774-ac37-9a9f00cb6f82', ARRAY['ace','ace-of-hearts','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('bda0671d-ae6b-4916-bafe-4064960fc170', ARRAY['ace','acolyte','acoustics','act-up','act-up-aids-coalition-to-unleash-power']::text[], '{}'::text[], 'junk'),
  ('76db773b-ce26-496d-8adf-f01c479ef3a1', ARRAY['abroromantic','abrosexual','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('61864284-f9de-4b59-870c-50dd89c97b37', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('e5f10efb-da08-41ae-b8fa-3c71c6dcb088', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('6c7d389c-bc4a-4b03-bd46-8e4990079fe0', ARRAY['abroromantic','abrosexual','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('115a3ec3-e2f3-4e90-9e81-40f93c715c48', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('d1110ea3-e43d-4c59-8e69-7ffb0af26169', ARRAY['abrosexual','abstinence','abstinence-based-approach','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('c634bb15-d77f-4549-91c2-f8cfff2a09e5', ARRAY['accessibility','ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('be680012-11e4-4963-a4c9-c6eaeaf16850', ARRAY['ace','ace-of-hearts','ace-of-spades','aceflux']::text[], '{}'::text[], 'junk'),
  ('33eef669-54e5-4381-94ea-1488f21fbeae', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('7951c8fc-61c1-4f88-99e0-bd1a668f90e7', ARRAY['accessibility','ace-of-hearts','aceflux']::text[], '{}'::text[], 'junk'),
  ('14a92816-2373-41e8-ab25-84c5551ae862', ARRAY['ace','ace-of-hearts','aceflux']::text[], '{}'::text[], 'junk'),
  ('4de1549c-975e-43f5-86f0-402d872e1bb5', ARRAY['accessibility','ace','acolyte','act-up','act-up-aids-coalition-to-unleash-power']::text[], '{}'::text[], 'junk'),
  ('b8e6ba5a-d656-4c02-bba9-1d3747d409e7', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('7dda926b-6edf-4f74-ab2b-0ea475e82808', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('f3592d22-e60c-44c0-bf6b-db041b8f811c', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('f1349f43-26e8-42c3-965b-7f56e98b1d31', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('dc7fee70-458f-4017-b738-01a324a62cc0', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('91157808-530c-442f-86b7-341564895236', ARRAY['accessibility','ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('84adf06f-ef45-4b02-b0e4-fcdee67f96a8', ARRAY['abduction-play','abstinence','accessibility','ace','ace-of-hearts','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('b678254e-1043-450c-a78d-ddd4169a21e4', ARRAY['accessibility','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('3d17c964-5281-43df-92de-82f7960f9e57', ARRAY['abroromantic','abrosexual','ace','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('2b5882aa-d18a-4d7a-9e79-a84b201fb4c1', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('a6f72ff3-94e3-482b-8329-522867086766', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('42f5d8ae-4f30-43b9-a00a-a8945a210da5', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('69fc2a03-70df-4514-801a-a3cdb310f88e', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('6a63a083-c376-44e3-99d1-cb97220be470', ARRAY['abstinence','abstinence-based-approach','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('9dae5ba2-b30d-48cd-adc7-3761f075ffcf', ARRAY['abroromantic','abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('6284fdad-cd02-41bd-8f44-1fe3cd81bcc9', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('318e2bca-fd08-4067-9594-859acc2d5d75', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('7226afbc-ef8f-4713-94b3-321eb583948d', ARRAY['abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('23959d5f-2a58-47a5-ba7c-44a67dd5c0c8', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('c96d2739-1e1b-4239-92d1-ac1be819db32', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('fb40ace0-5286-4185-a1b0-615abb2c3831', ARRAY['abroromantic','abrosexual','accessibility','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('0c779001-6316-480b-a98d-d537a7329573', ARRAY['abrosexual','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('e3897dca-f062-4dee-8a4d-4f4db2f037d6', ARRAY['abrosexual','abstinence','ace']::text[], '{}'::text[], 'junk'),
  ('221d8026-a556-484e-a846-9fd249946573', ARRAY['abroromantic','abrosexual','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('517775cb-1cb8-440e-a414-74273b25586e', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('83e3b26d-23b6-42b4-ab76-77e628a6b3a7', ARRAY['abstinence','accessibility','ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('d4ba4af4-9130-4f24-9ec6-e115f557eaad', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('428f3ea2-629a-4fe4-bd11-bd9e83f1c830', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('44d01b71-2b3f-49cc-821d-e3e28c1d5602', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('656300c5-30ee-4520-8bfc-1ee2cd84aeca', ARRAY['ableism','ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('6b78556a-3391-4391-96bc-995b552818dc', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('190835b8-96ff-41eb-91f8-40d918147949', ARRAY['abstinence','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('393e5eee-5b50-4123-8fc0-eb9393b7361d', ARRAY['abroromantic','abrosexual','ace','acespec']::text[], ARRAY['ace','acespec']::text[], 'mixed'),
  ('a7eee943-ea58-47fb-be5a-1b7fb2c0c426', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('f56e3439-c82e-4d8b-9710-ffbb3f7de015', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('7c297dfe-ac8a-4008-915d-9fd6ca38e702', ARRAY['abasiophillia','abstinence','ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('3d6d3a94-918a-43f6-b7b9-acb2e1d7e91f', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('f8d6986f-7ef8-4b15-915f-9a8b9d3a9885', ARRAY['abduction-play','abroromantic','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('e0560fa2-f135-4dca-b8d4-b6553cb16c7f', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('e78bfe71-358f-42ec-96c7-5e01bca8e8eb', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('131140a4-cd7e-4cde-ba18-2de976ae9322', ARRAY['accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('dd32cb1f-c914-4ea0-8707-f38a86fea1f8', ARRAY['abroromantic','abrosexual','accessibility','ace','acespec']::text[], ARRAY['ace','acespec']::text[], 'mixed'),
  ('a5dd2703-97af-471e-a3de-f7da4a395cf3', ARRAY['abrosexual','abstinence','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('370e674d-f41a-4a46-92b3-215ea4fd2ffc', ARRAY['abrosexual','abstinence','accessibility']::text[], '{}'::text[], 'junk'),
  ('e98e8071-908b-4188-a47a-3a26a3fa6dba', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('08079d76-0553-45b8-8aaa-be5f061457fd', ARRAY['ace','ace-of-hearts','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('dcf873aa-56da-4d9c-9953-be70f2eda864', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('d6850b69-a05f-4b3d-93c4-8b8daedffde2', ARRAY['abrosexual','ace','aceflux','acespec']::text[], '{}'::text[], 'junk'),
  ('ee3a9957-1024-4489-af50-41f73a16e7b8', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('6d228324-d1b7-435d-8904-36d795c32603', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('52c0685f-b6e8-4ced-bab1-c6a97c72ff76', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('151ea979-6eca-493a-b2dc-1ccfad836702', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('e6ec3b4a-a610-4307-8ba8-40e131cd82d5', ARRAY['abstinence','accessibility','ace','acolyte']::text[], ARRAY['abstinence']::text[], 'mixed'),
  ('2ee5076f-eb5f-4917-b2ba-b4bf979b2303', ARRAY['accomplice','ace','act-up']::text[], '{}'::text[], 'junk'),
  ('a1b667ef-30bc-4e6a-98e8-21b9cfb2c5cd', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('21005848-19ae-405b-89ac-ed73b0311a17', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('9492777a-efb8-4cac-86b3-73fe6bf6c438', ARRAY['abstinence','ace','acolyte']::text[], '{}'::text[], 'junk'),
  ('1942b6ad-2c64-4cde-81cd-e278580d56b3', ARRAY['accessibility','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('ade8106b-ce20-439c-a3ea-3379965fd1ee', ARRAY['abstinence','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('3cbd4d01-e248-4a64-bd54-d28996eba1cc', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('549ec97d-5076-4297-a0f6-55209741d361', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('735555c2-042e-497a-b767-ded9eeb53fdc', ARRAY['abroromantic','abrosexual','academic-institution','ace','aceflux','aces-in-relationships','acespec','achillean']::text[], ARRAY['academic-institution']::text[], 'mixed'),
  ('39c1973d-7d51-4ba4-828b-eed0987e1315', ARRAY['abrosexual','accessibility','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('7bc24f7a-5924-4cf2-aa1e-aad119fe550a', ARRAY['accessibility','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('20a7f10e-1222-4449-9242-f353dee69265', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('d476af62-3faa-417e-85ae-582f22f9dc6c', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('90d3fd1d-7ee5-41df-bc4e-47e1e490be72', ARRAY['abasiophillia','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('88ba0b3d-3aea-4b5d-9fac-f7620c17a792', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('0236c61b-b49a-486b-b98c-ba9aff13a763', ARRAY['abroromantic','abrosexual','accessibility','ace','aceflux','aces-in-relationships','acespec','acolyte']::text[], '{}'::text[], 'junk'),
  ('4c30af39-6801-43e6-a75a-3ef5e6f7a366', ARRAY['accessibility','ace','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('28189ebb-9672-4ba5-8d91-87ab396f08d5', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('6bd49d84-d644-4625-b116-70b9850e60a7', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('2e45eb0a-1667-49b7-86fd-51340a89359b', ARRAY['ace','ace-of-hearts','ace-of-spades','aceflux']::text[], '{}'::text[], 'junk'),
  ('ea4383d2-9a69-4d51-8577-cbdbf60eafeb', ARRAY['ace','ace-of-hearts','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('3c561214-5d9d-411a-a1d4-ad346e441100', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('de18a59a-2d51-4b51-a086-349300ac13c7', ARRAY['accessibility','accommodation','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('dd3cbe83-55e5-4156-9468-203c00e0f412', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('8d019c51-9057-4bbe-8890-bc38156a7764', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('fb1cfe3c-3d3b-4db1-a4a2-b24cd17d5e70', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('28d7c543-69f2-408c-971b-e5b5f4eb4bc5', ARRAY['accessibility','ace','ace-of-hearts','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('724bc054-1956-4721-815b-b453dd075322', ARRAY['abroromantic','abrosexual','ace','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('5c1f981b-7573-4ff1-a9da-6b4155d084b3', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('7c6af9bc-e7d8-4134-88a5-b2841201969f', ARRAY['abstinence','abstinence-based-approach','abstinence-based-recovery','accessibility','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('19390a3f-b026-4852-94cb-a8a9047f83f5', ARRAY['accessibility','ace','ace-of-hearts','aceflux']::text[], '{}'::text[], 'junk'),
  ('409cbb29-4fe8-415c-88b0-3c6cf245342a', ARRAY['abroromantic','abrosexual','ace','aceflux']::text[], '{}'::text[], 'junk'),
  ('a7625c44-f4e5-4580-a27a-34ce7d0cd3bb', ARRAY['ace','ace-of-hearts','aceflux']::text[], '{}'::text[], 'junk'),
  ('3c0352e0-b03d-432b-991b-89ba35be757c', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('9e950210-e230-42cc-851e-dee50f3f8a99', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('5ccc3fa3-b9d6-42c0-8972-b265a48e490f', ARRAY['abroromantic','abrosexual','ace','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('8e9a431a-4942-4d8d-89ad-4304316e714e', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('db679e45-55cb-4595-a0f2-9bbce404b860', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('97d984f7-657f-4f44-ab27-95430b881547', ARRAY['ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('c363fcd7-9473-4a4d-b48f-05a31ef34461', ARRAY['abroromantic','abrosexual','accessibility']::text[], '{}'::text[], 'junk'),
  ('a57a2194-ce14-49a8-b38c-1b79d32e7e74', ARRAY['ace','aceflux','acolyte','acoustics','act-up','act-up-aids-coalition-to-unleash-power']::text[], '{}'::text[], 'junk'),
  ('5b43a701-7bde-4ac4-8337-27db96517809', ARRAY['abstinence','abstinence-based-approach','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('10d03e97-a7f9-4556-aff2-12ecd265c453', ARRAY['abstinence','abstinence-based-approach','ace','ace-of-hearts']::text[], '{}'::text[], 'junk'),
  ('1b95db4d-96ee-4f09-a548-f5ee37704319', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('e2ee71fb-1083-42e5-b298-8617d1a88f25', ARRAY['accessibility','ace','ace-of-hearts','aceflux']::text[], '{}'::text[], 'junk'),
  ('b06fd26b-519e-4998-a7c0-241aafbe2a65', ARRAY['accessibility','ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('5d0fcc70-df48-492a-b91f-7dc0b0af1695', ARRAY['abstinence','abstinence-based-approach','accessibility']::text[], '{}'::text[], 'junk'),
  ('68c327d2-0492-4d31-b6ef-5a73b3523250', ARRAY['ace','ace-of-hearts','ace-of-spades']::text[], '{}'::text[], 'junk'),
  ('6089e26d-d3f8-4c50-bfa0-a6d55235b33f', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('e60b83ba-b26a-4929-a3ba-b42028d4730d', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades','aceflux','aces-in-relationships','acespec']::text[], '{}'::text[], 'junk'),
  ('850f4925-895e-41d7-8e80-e12d5388d73b', ARRAY['accessibility','ace','ace-of-hearts','aceflux','aces-in-relationships','acespec','acolyte']::text[], '{}'::text[], 'junk'),
  ('911999a7-164a-417b-bdb6-e98539e1e60a', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('11eae423-882b-4e41-a395-93f762873b6a', ARRAY['abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('62e21ef1-b10c-4db7-a352-b5b53758aacb', ARRAY['abroromantic','abrosexual','accessibility','ace']::text[], '{}'::text[], 'junk'),
  ('07a50477-13d3-400d-b3e5-0aef74b52f6a', ARRAY['abrosexual','abstinence','ace']::text[], '{}'::text[], 'junk'),
  ('f96278be-1013-4784-aa47-0f07dce1df5a', ARRAY['accessibility','ace','aceflux','acolyte']::text[], '{}'::text[], 'junk'),
  ('99db8514-559a-4af2-83bd-d85eb0e48563', ARRAY['ace','ace-of-hearts','ace-of-hearts-spades']::text[], '{}'::text[], 'junk'),
  ('d1f35712-8d7f-4582-ac3a-fb28cd2c4d6f', ARRAY['accessibility','ace','ace-of-hearts','ace-of-hearts-spades','ace-of-spades']::text[], '{}'::text[], 'junk')
) AS v(article_id, tags_before, tags_after, verdict)
ON CONFLICT (article_id) DO NOTHING;

-- Abort if the corpus moved under us: a row whose current tags no longer match the
-- snapshot was re-tagged after this migration was authored, and overwriting it would
-- discard the newer decision.
DO $$
DECLARE v_drift int;
BEGIN
  SELECT count(*) INTO v_drift
  FROM public.news_tag_vocab_dump_audit_20261007 a
  JOIN public.news_articles n ON n.id = a.article_id
  WHERE n.tags IS DISTINCT FROM a.tags_before;
  IF v_drift > 0 THEN
    RAISE EXCEPTION 'news tag vocabulary-dump retraction: % of 368 rows drifted since authoring; re-run the classifier', v_drift;
  END IF;
END $$;

UPDATE public.news_articles n
   SET tags = a.tags_after
  FROM public.news_tag_vocab_dump_audit_20261007 a
 WHERE n.id = a.article_id
   AND n.tags IS DISTINCT FROM a.tags_after;

-- Retract the graph edges the reconciler minted from the junk text. Keyed on the tag
-- no longer being present on the row (by name OR slug, the same two arms _canon uses),
-- so the 12 mixed rows keep the edges for the tags they kept.
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

-- Same recompute run_tag_assignment_reconcile performs, so usage_count is correct
-- immediately rather than only after the nightly pass.
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
  -- No row in the cohort may still hold a vocabulary page.
  SELECT count(*) INTO v_left
  FROM public.news_tag_vocab_dump_audit_20261007 a
  JOIN public.news_articles n ON n.id = a.article_id
  WHERE n.tags IS DISTINCT FROM a.tags_after;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'retraction did not apply to % rows', v_left;
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
    RAISE EXCEPTION '% orphaned tag assignments survived the retraction', v_edges;
  END IF;
END $$;
