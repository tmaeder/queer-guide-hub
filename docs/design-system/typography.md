# Typography

Two typefaces ship. Both are self-hosted (`/public/fonts/`).

## Inter — body + most headings

Default everywhere via MUI theme `fontFamily`. Use it for paragraphs,
form input, default headings, captions, all UI chrome.

## Plus Jakarta Sans — display

Used for visually prominent display text where Inter feels too
neutral. Apply via inline `fontFamily: "'Plus Jakarta Sans', sans-serif"`.

Current usage (do not extend without a reason):

- Homepage stats counters (large numbers, hero strip)
- Home widgets: `LatestNewsSlider`, `RegionalEventsCalendar`
- Personalities pages: `PersonalityCard`, `FeaturedPersonalityRail`,
  `StickyLetterBar`
- Trip booklet: `PackingTab` headers

## Rules

- Default to Inter unless the surface is a deliberate display moment.
- Never mix typefaces inside one paragraph.
- Both faces ship as variable fonts (weight 200–800, latin + latin-ext,
  upright + italic).
- Total font payload: 4 woff2 files (Inter + Plus Jakarta × latin/ext).

## If you need a third typeface

You don't.
