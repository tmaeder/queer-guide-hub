# Cruising glossary pass

## Goal

Compare the four supplied cruising guides with the glossary's final migrated
state, improve the existing `cruising` entry where the comparison exposes
concrete omissions, and create only genuinely distinct missing vocabulary.

## Editorial approach

Use a hybrid, concept-led pass rather than turning advice sections into glossary
pages.

- Expand `cruising` with a plain definition, queer historical context, the
  distinction between public, semi-public and dedicated settings, consent and
  non-participant boundaries, legal variability, privacy and exit planning,
  sexual-health options, harm reduction and non-shaming language.
- Treat eye contact and body language as possible invitations, never automatic
  consent. Non-response, withdrawal and refusal end an approach.
- Add `cruising-ground` only if final duplicate and alias checks confirm that
  the place concept is absent. Define it generically and never publish locations
  or directions that could expose people using one.
- Audit `anonymous-sex`, `public-sex` and `cottaging` for concrete omissions;
  preserve correct existing prose rather than rewriting for uniformity.
- Do not create article-shaped entries such as “Cruising Etiquette,” “Cruising
  Safety” or “Cruising Signals.”
- Leave `bathhouse`, `glory-hole` and `darkroom` unchanged unless the audit finds
  a factual defect; they are related places or practices, not synonyms.

## Sources and safety

Record the supplied Grindr, Out, GayCities and Pride articles as editorial
sources. They support cultural context and community practice, but lifestyle
articles are not sufficient authority for medical or legal claims. Corroborate
consequential sexual-health statements with suitable public-health sources and
state legal variability without attempting jurisdiction-specific advice.

The prose must not identify a cruising location or provide directions to one.
Any new sensitive page starts non-indexable pending the existing publication
readiness process.

## Data changes

Implement the pass as a forward-only Supabase migration. Existing-page updates
must be content-guarded so later editorial work wins. New-page creation must
check names, slugs and aliases before insertion and keep category ID, category
display text and the primary category assignment consistent. Add provenance in
`tag_sources` without duplicating URL/tag pairs.

## Verification

Add a focused Vitest regression file covering:

- content guards on every existing-page prose update;
- duplicate and alias protection for `cruising-ground`;
- active, reviewed, sensitive and non-indexable creation state;
- category consistency and safe search aliases;
- attribution of all supplied sources plus authoritative health corroboration;
- positive consent, non-participant, privacy, exit and harm-reduction language;
- the absence of exact cruising locations and rejected advice-page slugs;
- post-migration assertions for the intended final state.
