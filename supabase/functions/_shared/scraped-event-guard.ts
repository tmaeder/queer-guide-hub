/**
 * Decides whether an item scraped from a generic listing page may be staged as an event.
 *
 * `scrape-web-sources` used to fill a missing date with "now" and a missing city with the
 * literal string 'Unknown'. On eventfrog's LGBTIQ listing that turned the page's own promo
 * tile ("Fehlt dein Event? Erfasse deinen Event ...") into a public, indexable event on every
 * run -- 66 rows over two months -- and minted a city called "Unknown" to hang them on.
 *
 * An event without a date is not an event we can publish, so it is dropped, never dated by the
 * scraper's clock. The promo-title list is a second, narrower net for listing tiles that do
 * carry a date.
 */

export type ScrapedEventRejectReason = 'no_start_date' | 'promo_placeholder'

const PROMO_TITLE =
  /^\s*(fehlt dein (event|anlass)|dein (event|anlass) fehlt|event (eintragen|erfassen|hinzufügen)|add (your|an) event|submit (your|an) event|list your event|missing (your|an) event|is your event missing|promote your event)\b/i

export function scrapedEventRejectReason(item: {
  title?: string | null
  name?: string | null
  start_date?: string | null
}): ScrapedEventRejectReason | null {
  const title = item.title || item.name || ''
  if (PROMO_TITLE.test(title)) return 'promo_placeholder'
  if (!item.start_date || Number.isNaN(Date.parse(item.start_date))) return 'no_start_date'
  return null
}
