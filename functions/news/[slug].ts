/**
 * /news/:slug — P1.2 hard remove (410 Gone). Cloudflare Pages
 * _redirects only supports 301/302/303/307/308/404, not 410, so we
 * serve the Gone response from a Pages Function instead. /news (the
 * index) is unaffected — it remains a curated headline list rendered
 * by the SPA.
 *
 * Body matches the static /410.html so the response is meaningful to
 * users who land here via stale bookmarks; the status code is what
 * tells Google to drop the URL from the index permanently.
 */

const BODY = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>This article has been removed · Queer Guide</title>
<style>
  html, body { height: 100%; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: #0a0a0a; color: #fafafa; }
  main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
  .card { max-width: 36rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; line-height: 1.3; }
  p { color: #a1a1aa; margin: 0 0 1.25rem; line-height: 1.55; }
  a { color: #fafafa; }
  footer { padding: 1rem; text-align: center; color: #71717a; font-size: 0.875rem; }
</style>
</head>
<body>
<main><div class="card">
<h1>This article has been removed</h1>
<p>Queer Guide no longer publishes individual news article pages. Headlines now link directly to the original publishers.</p>
<p>Read the curated headline index at <a href="/news">/news</a> or browse long-form essays on the <a href="/blog">blog</a>.</p>
</div></main>
<footer>Queer Guide</footer>
</body>
</html>`;

export const onRequest: PagesFunction = async () =>
  new Response(BODY, {
    status: 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400, max-age=3600',
    },
  });
