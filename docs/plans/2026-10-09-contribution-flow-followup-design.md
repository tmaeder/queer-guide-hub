# Contribution Flow Follow-up

## Intent

Keep one contribution surface while making its information architecture match the user's intent:

- scanning is a way to add content, not a peer destination;
- safety, moderation and bugs are context-rich reports, not private contact categories;
- page corrections include a screenshot and diagnostics by default for signed-in and anonymous reporters.

The change must preserve anonymous feedback and corrections without opening anonymous directory-entity writes or a general-purpose anonymous image upload path.

## Information architecture

The root chooser has four destinations:

1. Report a problem or share an idea
2. Fix something on this page
3. Add something new
4. Contact the team

“Scan a flyer or link” moves into “Add something new” as a prominent option alongside the individual entity types. It keeps the existing authentication gate and batch-review experience. The scan implementation remains lazy-loaded so the global launcher does not eagerly pull its heavy dependencies.

The report branch offers Safety and moderation, Bug reports, Idea, Improvement and Content idea. Contact retains Support, Partnerships and Something else. Existing safety and bug contact deep links resolve to the report branch, while new links target `/submit/feedback` directly with the appropriate category.

## Screenshot and diagnostics

Opening the global contribution launcher captures the underlying page before the dialog mounts, for every visitor. Feedback and correction forms receive that in-memory image.

Both forms show a checked-by-default “Include screenshot of this page” control when a capture is available. The screenshot is generated automatically; there is no file picker or separate upload action. The reporter may opt out before submitting.

Both report types always capture the existing diagnostic context at submit time: page URL, viewport, user agent, recent console errors and recent network failures. The correction form makes this explicit in the UI, matching feedback.

## Anonymous screenshot boundary

Do not make the existing `upload-image-r2` function public because it supports unrelated image namespaces.

Add a dedicated community-report screenshot function that:

- is callable without a user session;
- accepts only a screenshot plus an existing feedback/correction submission identifier;
- verifies the referenced row is recent and has `content_type` equal to `feedback` or `correction`;
- requires a high-entropy upload token written into that submission's private JSON payload;
- accepts only JPEG/PNG/WebP image bytes within a strict compressed size limit;
- writes only to the `feedback-screenshots` namespace;
- updates only that submission's `screenshot_url` and removes the one-time token;
- applies the repository's existing CORS, abuse-control and logging conventions.

The browser first inserts the report through the existing RLS-protected path, then uploads the automatically captured screenshot in the background using the returned identifier/token contract. Screenshot failure never loses the textual report. The endpoint cannot create or mutate directory entities.

If the current insert API cannot safely return the identifier to anonymous callers without widening row visibility, replace the two-step contract with one purpose-built community-report function that validates and inserts only `feedback` or `correction`. Do not add an anonymous SELECT policy.

## Compatibility

- `/submit`, `/submit/:type`, `/submit/feedback` and locale-prefixed routes remain valid.
- The global launcher keeps its portal layering and clearance offsets.
- `/contact?category=safety` and `/contact?category=bugs` continue to reach the intended report category.
- Contact messages continue through the private `contact-form` email pipeline.
- Anonymous entity submissions remain blocked.

## Verification

- Unit-test chooser structure, nested scan navigation, contact/report category ownership and deep-link compatibility.
- Mutation-test screenshot defaults, opt-out, diagnostic payloads, anonymous upload failure fallback and the entity auth gate.
- Validate the Edge Function's content-type, size, submission-type, age and token checks.
- Run focused Vitest, Edge Function tests, lint, typecheck, i18n completeness and build.
- After deployment, run production E2E for chooser navigation, report categories, correction screenshot defaults, nested scan auth, contact categories and preserved deep links without creating a real contact email.
