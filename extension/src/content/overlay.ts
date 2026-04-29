/**
 * M9.1 — inline overlay. Decorates <a href> on every page that points to
 * a venue / event / news_article known to queer.guide. Magenta dotted
 * underline + tooltip. Cache fetched once per session via background
 * service-worker (chrome.runtime.sendMessage 'qg:known-urls'); kept in
 * memory only.
 *
 * No DOM mutation if the cache is empty or fetch fails. Idempotent: marks
 * each <a> with data-qg-decorated="1".
 */

interface KnownPayload {
  domains: [string, string][];
  eventUrls: [string, string][];
  newsUrls: [string, string][];
}

const ACCENT = "#d4007f";

function normaliseHref(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function decorate(anchor: HTMLAnchorElement, slug: string, type: "venue" | "event" | "news") {
  anchor.dataset.qgDecorated = "1";
  anchor.style.textDecoration = "underline";
  anchor.style.textDecorationStyle = "dotted";
  anchor.style.textDecorationColor = ACCENT;
  anchor.style.textUnderlineOffset = "3px";
  if (!anchor.title) {
    anchor.title = `queer.guide — ${type}: /${type}s/${slug}`;
  }
}

(async function run() {
  if ((window as unknown as { __qgOverlayMounted?: boolean }).__qgOverlayMounted) return;
  (window as unknown as { __qgOverlayMounted?: boolean }).__qgOverlayMounted = true;

  const reply = await chrome.runtime
    .sendMessage({ type: "qg:known-urls" })
    .catch(() => null);
  const payload = (reply?.payload ?? null) as KnownPayload | null;
  if (!payload) return;

  const domainMap = new Map<string, string>();
  for (const [d, slug] of payload.domains) domainMap.set(d.replace(/^www\./, ""), slug);
  const eventMap = new Map<string, string>();
  for (const [u, slug] of payload.eventUrls) eventMap.set(u, slug);
  const newsMap = new Map<string, string>();
  for (const [u, slug] of payload.newsUrls) newsMap.set(u, slug);

  function decorateAll() {
    const anchors = document.querySelectorAll<HTMLAnchorElement>("a[href]:not([data-qg-decorated])");
    for (const a of Array.from(anchors)) {
      const abs = normaliseHref(a.getAttribute("href") || "", location.href);
      if (!abs) continue;

      const evtSlug = eventMap.get(abs);
      if (evtSlug) { decorate(a, evtSlug, "event"); continue; }

      const newsSlug = newsMap.get(abs);
      if (newsSlug) { decorate(a, newsSlug, "news"); continue; }

      try {
        const host = new URL(abs).host.replace(/^www\./, "");
        const venueSlug = domainMap.get(host);
        if (venueSlug) decorate(a, venueSlug, "venue");
      } catch { /* ignore */ }
    }
  }

  decorateAll();
  // Re-run on DOM changes (SPAs, infinite scroll). Throttle to 500ms.
  let pending = false;
  const obs = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; decorateAll(); }, 500);
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();
