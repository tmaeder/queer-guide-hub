-- Two explanations seeded by 99991792730290 state things that are not true.
--  * news-gate:image_unusable said approving "publishes the article without a
--    usable image". A human approval commits the staged image unchanged; only
--    an automatic pass with image_suppressed drops it (99991792729790).
--  * news-review:awaiting_llm_verdict said items "are closed automatically"
--    after seven days. run_staging_auto_reject_stale (cron 45 3 * * *)
--    REJECTS them.
-- Each update is guarded on the seeded text, so an editor's rewrite is kept.

update public.pipeline_explanations
   set what_now = 'Look at the image. Approving publishes the article with this image, so reject if the image is wrong for the story.'
 where key = 'news-gate:image_unusable'
   and what_now = 'Look at the image. Approving publishes the article without a usable image.';

update public.pipeline_explanations
   set body = 'The article reached the review gate before the quality check produced a verdict. Items still waiting after seven days are rejected by the nightly stale sweep (run_staging_auto_reject_stale).'
 where key = 'news-review:awaiting_llm_verdict'
   and body = 'The article reached the review gate before the quality check produced a verdict. Items waiting more than seven days are closed automatically.';

do $verify$
begin
  if exists (select 1 from public.pipeline_explanations
              where (key = 'news-gate:image_unusable' and what_now like '%without a usable image%')
                 or (key = 'news-review:awaiting_llm_verdict' and body like '%closed automatically%')) then
    raise exception 'news gate explanation corrections did not apply';
  end if;
end
$verify$;
