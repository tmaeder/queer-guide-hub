# Country single polish

Approved by the user on 10 October 2026. Scope: country detail pages.

## Direction

Cities and travel lead the browsing flow. Preserve the supplied Queer Guide
subway visual system: Anton headings, Space Grotesk body, paper/ink surfaces,
yellow country wayfinding, route bullets, compact stop lists and rounded
semantic radii. The downloaded templates are visual references; their laws,
dates and rider reports are sample content, not facts to publish.

## Layout

- Compact masthead with introduction, stable census and one trip-planning action.
- Prominent criminalisation warning and safety verdict with a direct rights link.
- Cities expanded by default, as compact subway stops beside the single map.
- Travel next, with practical facts always visible and travel options expandable.
- Rights and safety, dated legal history and source attribution follow travel.
- Venues, events, statistics and news stay in quieter expandable sections.
- Long editorial description moves into a secondary About disclosure.
- Remove the competing opening photograph and redundant rights-card heading.

## Guardrails and verification

Retain criminalisation/death-penalty semantics, pending verdict state and travel
promotion gates. Preserve #rights and #history links and section/route-rail
agreement. Do not invent sources, checked dates or safety reports. Keep all
content available on mobile, use real links and accessible disclosure controls.

Verify country unit tests and rights disclosure tests, lint and typecheck;
inspect desktop and mobile renders for rich and safety-critical country data,
check navigation/disclosures, missing-data behavior and horizontal overflow.

## Implementation refinements

Government, national day, calling code and domain remain available inside the
Travel disclosure; capital, population, languages, currency, driving, airports
and weather form the visible essentials. About opens the complete editorial
text with one disclosure instead of a second nested Read more control. Footer
comparison actions are compact links rather than another large promotional band.

## Verification

- 39 targeted country, component, rights-disclosure and safety-verdict tests pass.
- Production Vite build passes; changed source files pass ESLint.
- Desktop (1440px) and mobile (390px) inspected for Germany and Afghanistan.
  All four have zero horizontal overflow and no browser page errors.
- Axe finds no violations in Cities, Travel and Rights in all four renders.
- Travel disclosure opens, rights navigation updates the hash, one map remains,
  and criminalising destinations continue to suppress travel promotions.
- New labels are localized in all 11 supported locales, with public copies
  synchronized and duplicate-key verification passing.
- Final repository typecheck passes its ratchet: 768 existing errors, no new
  errors against the 794-error baseline. Formatting and diff whitespace checks pass.

## Production release preparation

The release is isolated on current main. It retains the CountryMap silhouette,
city markers and theme behavior, with coordinate-aware full-map links and the
existing visited-place metadata. Country-specific browser expectations now
assert the inline map and cities-first flow rather than an obsolete side rail.

The clean release passes 69 targeted unit tests and 10 country-map/single-page
browser tests, covering phone layout, map geometry and capital labels, theme
switching, section targets and travel disclosure navigation.
