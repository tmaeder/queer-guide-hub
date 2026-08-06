// Cache-poisoning rotation (2026-08-06). During a deploy-propagation window
// Cloudflare cached the SPA shell HTML under this chunk's URL, keyed to the
// CORS variant that `<link rel="modulepreload" crossorigin>` requests — so
// every real browser got text/html for it while plain curl got clean JS. The
// chunk is lazily imported, so it is absent from the shell's preload list and
// scripts/smoke-pages.sh never purged it; `purge_everything` did not evict it
// either. A hashed URL that cannot be purged can only be escaped by changing
// its bytes, which is what this comment does. Do not remove it to "tidy up" —
// deleting it re-emits the poisoned hash.
export { EntityCard, type EntitySpan } from './EntityCard';
export { PageHero } from './PageHero';
export { BentoSection, spansForPreset } from './BentoSection';
