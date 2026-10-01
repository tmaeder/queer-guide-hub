# Contextual rights news

## Decision

`/rights` keeps one compact, shared news module rather than placing a feed below
each of the 18 legal-right rows. The selected map right and each ledger row can
focus that module. News provides current reporting context; it never changes or
supersedes the ILGA legal data.

## Relevance model

- Every `RIGHT_TOPICS` slug has a curated list of canonical `news_articles.tags`.
- Results rank recent topic-and-country matches first, then recent global topic
  matches, older topic matches, and finally recent general `rights-legal` news.
- Country is a boost, never a filter. Sparse countries still receive useful
  global coverage.
- Existing publication, quality, archival, and duplicate gates apply.
- Articles in the same `news_story` collapse to one representative and link to
  the story page when the cluster has multiple members.
- Broader fallback results are labelled explicitly.

## Reader experience

The module shows the topic selector, 3–6 cards, outlet, date, excerpt, geographic
context, match explanation, and multi-outlet count. Map selection updates it;
each ledger row has a `Latest coverage` action that updates it and scrolls to
the module. Its archive action links to `/news/all?right=<right-slug>`.

The archive resolves the stable right slug through the same mapping, displays a
removable active filter, and keeps the right in its URL while other filters or
sort order change. The generic rights-news link uses
`/news/all?category=rights-legal`.

## Boundaries

Phase one does not add per-right landing pages, change the ILGA import, infer
legal status from journalism, or require a detected country.
