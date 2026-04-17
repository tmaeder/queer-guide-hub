-- Insert RSS feed sources for daily news import
INSERT INTO public.news_sources (name, url, source_type, category, is_active, fetch_frequency) VALUES
('The Guardian - LGBT Rights', 'https://www.theguardian.com/world/lgbt-rights/rss', 'rss', 'rights', true, 1440),
('Washington Blade', 'http://www.washingtonblade.com/feed/', 'rss', 'news', true, 1440),
('BuzzFeed LGBT', 'https://www.buzzfeed.com/lgbt.xml', 'rss', 'lifestyle', true, 1440),
('LGBTQ Reads', 'https://lgbtqreads.com/feed/', 'rss', 'culture', true, 1440),
('Reddit LGBT', 'https://www.reddit.com/r/lgbt/.rss', 'rss', 'community', true, 1440),
('Pink News', 'https://www.thepinknews.com/feed/', 'rss', 'news', true, 1440),
('SF Gate Gay & Lesbian', 'https://www.sfgate.com/rss/feed/Gay-Lesbian-601.php', 'rss', 'news', true, 1440),
('The Guardian - Transgender', 'https://www.theguardian.com/society/transgender/rss', 'rss', 'transgender', true, 1440),
('OII Australia', 'http://oii.org.au/feed/', 'rss', 'advocacy', true, 1440),
('Google News LGBT Rights', 'https://news.google.com/rss/search?q=lgbt+rights+when:7d&hl=en-US&gl=US&ceid=US:en', 'rss', 'news', true, 1440),
('LGBTQ Nation', 'https://www.lgbtqnation.com/feed/', 'rss', 'news', true, 1440),
('Outsports', 'https://www.outsports.com/feed/', 'rss', 'sports', true, 1440),
('ILGA Europe', 'https://www.ilga-europe.org/feed/', 'rss', 'advocacy', true, 1440),
('TGEU', 'https://tgeu.org/feed/', 'rss', 'transgender', true, 1440),
('ILGA World', 'https://ilga.org/feed/', 'rss', 'advocacy', true, 1440),
('EU LGBT Legislation 1', 'https://eur-lex.europa.eu/EN/display-feed.rss?myRssId=zqe48Zw8qk8wdPml3HdUM5mEZHtwpDcrAX2pXTQSRqI%3D', 'rss', 'legislation', true, 1440),
('EU LGBT Legislation 2', 'https://eur-lex.europa.eu/EN/display-feed.rss?myRssId=zqe48Zw8qk8wdPml3HdVP8VkV%2BT%2FTkIbnBV4%2Bqh95eo%3D', 'rss', 'legislation', true, 1440),
('EU LGBT Legislation 3', 'https://eur-lex.europa.eu/EN/display-feed.rss?myRssId=zqe48Zw8qk8wdPml3HdUMiISbCssu1uJrid8cUH2nLk%3D', 'rss', 'legislation', true, 1440),
('Queerty', 'https://www.queerty.com/feed', 'rss', 'lifestyle', true, 1440),
('Out Magazine', 'https://www.out.com/customfeeds/js/feed/rss', 'rss', 'lifestyle', true, 1440);

-- Set up daily cron job to fetch news from all active sources
SELECT cron.schedule(
  'daily-news-fetch',
  '0 6 * * *', -- Every day at 6 AM
  $$
  SELECT
    net.http_post(
        url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/fetch-news',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
        body:='{"scheduled": true}'::jsonb
    ) as request_id;
  $$
);