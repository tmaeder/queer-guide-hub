# Keep page previews out of event artwork

The source-owned image worker accepts generic OpenGraph/Twitter images from source or organizer pages, including pages without matching Event data. Large publisher, city or profile covers can become event artwork after retiring the generic stock endpoints.

HTML candidates now come only from matching named Event JSON-LD with an explicit valid start date under the existing one-day calendar comparison. Generic social-preview metadata contributes no images. Reject direct Pexels/Unsplash images and known GayOut city/stock namespaces. Raw event-owned AgendaQ posters keep their separate exact source-path route and dimension checks. Content enrichment and native auth/writer/lease/budget/quality contracts stay unchanged.

The canonical image schedule was temporarily paused and its sole cron removed, preserving all other schedules. Restore its original active `18 * * * *` schedule after verifying the deployed guard and actual worker response. The two generic stock modes remain consolidated/disabled.

Twelve Deno tests and lint pass. HTTP regressions prove an unrelated social preview causes no image fetch, canonical patch or inference, while an identified Event poster and registered feed poster still promote. Pure cases cover absent/malformed/impossible dates, wrong events, social metadata, known stock/city covers and relative URLs. Full production E2E and replay follow normal deployment.
