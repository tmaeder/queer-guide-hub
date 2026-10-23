-- `news-gate:*` and `news-review:*` — plain language for why a news article
-- is waiting for a human in the review queue.
--
-- The news publish gate (`supabase/functions/_shared/news-quality/decision.ts`,
-- `evaluatePublishGate`) writes its reasons to
-- `ingestion_staging.enriched_data.auto_publish_blocked_reasons`, and
-- `pipeline-review-gate` writes `enriched_data.review_reason`. Nothing in the
-- admin UI explained either; `NewsStagingPreview` now reads these rows and
-- renders any key WITHOUT a row as the raw key in monospace — never a
-- prettified derivation (the rule `99991790358904` established).
--
-- Bodies are derived from the gate's own predicates: RELEVANCE_MIN 0.75,
-- QUALITY_MIN 0.7, CONFIDENCE_MIN 0.7; `empty_extraction` is
-- `extractionIsEmpty()` (confidence 0 and empty body, title and excerpt).
-- Measured 2026-10-22 over pending news staging: low_relevance 350,
-- low_confidence 256, manual_review_requested 217, image_unusable 184,
-- low_quality 169, empty_extraction 81, entity_links_pending_review 46,
-- truncated_body 19, advertorial 7, satire 6. critical_paywall and
-- code_residue are emitted by the gate but had no pending rows.
--
-- `unjudgeable` is NOT seeded: no producer emits it today, and prose for a
-- condition that was not read is invented. It renders raw until one does.
--
-- Severity is `warning` throughout: every one of these routes the article to
-- review, none rejects it outright. ON CONFLICT DO NOTHING, per the table's
-- convention — a re-run must never clobber an editor's rewrite.

insert into public.pipeline_explanations (key, title, body, what_now, severity) values
('news-gate:low_relevance', 'Not clearly LGBTQ+ relevant',
 'The quality check judged the article not relevant, or scored its relevance below 0.75. Below 0.3 with a "not relevant" verdict the gate rejects outright, so anything here sits in between.',
 'Read the article: publish if it is about LGBTQ+ people, places or rights; reject if the queer angle is incidental.', 'warning'),
('news-gate:low_quality', 'Article quality below the bar',
 'The cleaned article scored below 0.7 for quality — typically thin text, leftover navigation or boilerplate, or a body that is mostly a teaser.',
 'Check the body reads as a complete article. Reject if it is a stub or a listing.', 'warning'),
('news-gate:low_confidence', 'Model was unsure of its verdict',
 'The quality check reported a confidence below 0.7, so its publish or reject recommendation is not trusted on its own.',
 'Decide from the article itself rather than from the verdict.', 'warning'),
('news-gate:manual_review_requested', 'Model asked for a human',
 'The quality check flagged this article as needing manual review — usually a sensitive topic, an ambiguous subject, or claims it could not assess.',
 'Read the warnings and rationale in the verdict, then decide.', 'warning'),
('news-gate:critical_paywall', 'Behind a hard paywall',
 'The sanitizer found a paywall that hides most of the article, so the stored body is only what the publisher shows non-subscribers.',
 'Publish only if the visible part stands on its own; otherwise reject.', 'warning'),
('news-gate:truncated_body', 'Body looks truncated',
 'The extracted body ends early or is much shorter than the source suggests, so readers would get a partial article.',
 'Open the original. If the full text is there, the extractor missed it; reject or correct the body.', 'warning'),
('news-gate:code_residue', 'Code left in the body',
 'The sanitizer could not fully remove CSS or JavaScript from the article body, so machine code would show in the published text.',
 'Correct the body before approving, or reject.', 'warning'),
('news-gate:satire', 'Flagged as satire',
 'The quality check judged the article to be satire. Satire is never auto-published because it can be read as fact.',
 'Publish only if the publication is clearly satirical and the piece is worth carrying.', 'warning'),
('news-gate:advertorial', 'Flagged as advertorial',
 'The quality check judged the article to be sponsored or promotional content rather than reporting.',
 'Reject paid promotion; publish only if it is genuine news that happens to mention a brand.', 'warning'),
('news-gate:image_unusable', 'Image not usable',
 'Neither the quality check nor the image probe accepted the article image — it is missing, broken, irrelevant or too low quality.',
 'Look at the image. Approving publishes the article without a usable image.', 'warning'),
('news-gate:entity_links_pending_review', 'Linked places or people need checking',
 'The article was linked to cities, countries, people or organisations where at least one match was ambiguous, so the links were held for review.',
 'Check the linked names below match what the article is actually about.', 'warning'),
('news-gate:empty_extraction', 'Model returned nothing',
 'The quality check produced an empty record: confidence 0 and no title, excerpt or cleaned body. This is absence of a verdict, not a judgement that the article is bad.',
 'Decide from the original article; the verdict card has nothing to go on.', 'warning'),
('news-review:awaiting_llm_verdict', 'Waiting for the quality check',
 'The article reached the review gate before the quality check produced a verdict. Items waiting more than seven days are closed automatically.',
 'Usually nothing — it resolves when the verdict lands. Decide now only if it is urgent.', 'info'),
('news-review:llm_needs_review', 'Quality check sent it to review',
 'The quality check finished and its overall status was review rather than pass or reject; the gate reasons above say why.',
 null, 'info'),
('news-review:auto_publish_blocked', 'Passed, but publishing was blocked',
 'The quality check did not ask for review, but at least one publish-gate condition failed, so it could not be auto-published.',
 null, 'info')
on conflict (key) do nothing;

do $verify$
declare v_n int;
begin
  select count(*) into v_n from public.pipeline_explanations
   where active and key in (
     'news-gate:low_relevance','news-gate:low_quality','news-gate:low_confidence',
     'news-gate:manual_review_requested','news-gate:critical_paywall','news-gate:truncated_body',
     'news-gate:code_residue','news-gate:satire','news-gate:advertorial','news-gate:image_unusable',
     'news-gate:entity_links_pending_review','news-gate:empty_extraction',
     'news-review:awaiting_llm_verdict','news-review:llm_needs_review','news-review:auto_publish_blocked');
  if v_n <> 15 then
    raise exception 'news gate explanations: expected 15 active rows, found %', v_n;
  end if;
end $verify$;
