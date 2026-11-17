# Legacy source and feed recovery

Authorized scope: repair the remaining registered scraper/feed failures and identify exactly which external settings remain missing.

Prefer correcting verified registration paths and public publisher feeds over adding replacement providers. Extend existing bounded parsers where actual publisher markup has changed. Preserve resource budgets, source attribution, real prices/dates, disabled-source decisions, SSRF checks, and truthful health counters. Do not substitute unrelated podcasts, invent dates, replay migrations, or purchase provider credits.

Implementation: support explicit same-origin product sitemaps and image-bearing product entries; update modern Wikipedia heading wrappers and published WNBR dates; use current publisher card selectors/machine dates. Report all missing Shopify/Etsy settings together without exposing secret values. Record source configuration changes and original values in the operational audit.

Validation: parser regression cases based on downloaded publisher markup; Deno type checks and targeted tests; normal required PR checks, merge and deployment; serial bounded production imports, avoiding the shared-worker CPU exhaustion observed during simultaneous retries. Genuine retired/private feeds and upstream access restrictions stay explicit blockers.
