-- P1.5: bulk image for World Naked Bike Ride events.
-- 1,071 WNBR events share one homepage with no og:image, so og-scraping can't
-- help them. They're all editions of the same global franchise, so one canonical
-- WNBR photo (Wikipedia lead image, Wikimedia Commons, 960px thumb) is the right
-- shared cover. Cuts the corpus image gap from ~52% to ~19% in one statement.
-- Idempotent: only fills empty image arrays. (No-op on a fresh DB.)

update public.events
set images = array['https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/PNBR-2016-20_%2829566148206%29.jpg/960px-PNBR-2016-20_%2829566148206%29.jpg']
where data_source = 'worldnakedbikeride.org/wiki'
  and duplicate_of_id is null
  and (images is null or array_length(images, 1) is null);

select public.run_event_completeness_recompute();
