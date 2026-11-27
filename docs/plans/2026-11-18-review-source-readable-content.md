# Review source content extraction

The authorised review-queue repair exposed a municipal page with over 30,000 characters of navigation ahead of its actual content. The current reader strips tags and keeps the first 18,000 characters, so a successful fetch can supply only menus to the reviewer. Kempten's homepage also exceeds the separate 512 KiB response limit; its linked legal page fits that limit.

Prefer the page's main content using the existing pinned Cheerio dependency. Retain its title, head JSON-LD and footer contact details, and remove navigation and non-content markup. Pages without a usable main element fall back to their body. Plain text and JSON remain text. Mark any text clipped at the existing 18,000-character limit as omitted, so the existing model instructions can recognise incomplete context. Keep the 512 KiB, time, redirect, destination, attempt and evidence-count limits, and all existing review gates.

Increasing fetch limits would not address navigation crowding. Returning partial oversized HTML would add incomplete-source semantics and is outside this fix. The chosen change works with complete responses that already fit the reader's limits.

Verify long navigation before main, structured event dates, footer addresses, body fallback, hidden/script removal, non-HTML preservation, omission markers and text bounds. Exercise the existing recovery/security regressions and captured municipal legal page locally. PR5388 is merged; its exact migrations and city/review runtimes were verified separately before this follow-up.
