-- Drain marketplace listing images to R2 and keep them there.
--
-- marketplace-image-mirror downloads each listing's images, uploads to the public
-- R2 bucket `marketplace-images`, and rewrites marketplace_listings.images[] to the
-- R2 public URLs, so the frontend delivers images from R2 rather than raw merchant
-- CDNs (many of which fail on invalid certs / ORB). The curated-bypass ingest of 18
-- new merchants committed via SQL and skipped the mirror node, leaving ~9,400
-- listings on external URLs; this cron drains that backlog (~480/run-hour) and
-- auto-mirrors all future marketplace ingests. R2 storage is separate from the
-- disk-constrained Postgres volume, so this is disk-safe.
--
-- (Companion to the frontend fix that makes all six marketplace grids resolve the
-- R2-optimized image via useEntityImageAssets before falling back to images[0].)
select cron.schedule('marketplace_image_mirror', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-image-mirror',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8'),
    body := '{"limit":40}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);
