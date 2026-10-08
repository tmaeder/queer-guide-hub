# Contribute Dialog Consolidation

## Outcome

Replace the duplicate feedback and submission experiences with one shared contribution component tree. The global feedback button opens the chooser in an overlay, while `/submit` and `/submit/:type` remain resilient deep links that mount the same tree in a page shell.

## Shared entry point

`ContributeDialog` owns four lazily loaded branches:

1. Report a problem or idea: anonymous-friendly feedback, preserving page diagnostics and authenticated screenshots.
2. Fix something on this page: anonymous-friendly corrections with page URL and, when available, entity identity.
3. Add something new: the existing registry-driven submission wizard, gated before form entry for signed-out users.
4. Scan a flyer or link: the existing scanner and batch reviewer in a roomy sheet/page presentation, also gated before entry.

Only the chooser and trigger infrastructure belong to the eager global chunk. Submission field definitions, scanner code, batch review code, and screenshot tooling load with their branches.

## Routes and trigger

- `FeedbackButton` retains its existing fixed positioning, `z-[45]`, responsive clearance variables, and screenshot-before-overlay behavior, but becomes the trigger for `ContributeDialog`.
- Its accessible label is widened from feedback-only wording and corresponding e2e selectors are updated.
- `/submit` renders the chooser in page mode.
- Static `/submit/:type` routes remain to avoid collisions with the optional locale segment.
- `/submit/feedback` opens the feedback branch, while entity slugs open the add branch at that type.
- The duplicate feedback registry entry is removed.

## Forms and authorization

- Feedback and corrections insert into `community_submissions` as `feedback` and `correction` respectively.
- Feedback retains captured diagnostics and URL context. Screenshot controls are visible only to signed-in users because the upload endpoint requires authentication.
- Corrections contain the affected entity when known, page URL, a description of what is wrong, the proposed correction, and optional contact email.
- Entity and scan branches remain authenticated. Signed-out users see the sign-in affordance before entering either workflow.
- Anonymous RLS expands only from feedback to feedback plus correction. Entity ingestion remains unavailable to anonymous callers.

## Page entity context

Add a provider and publisher hook mirroring `BreadcrumbContext`. Detail pages publish `{ contentType, contentId, contentName }`, and clear it on unmount. The correction form falls back to URL-only context when no entity is published.

## Registry repair

Keep `/submit/place` and add the missing `places` field registry so its form cannot submit an empty payload. Add regression coverage that fails if the route renders zero usable fields or can submit an empty object.

## Cleanup and localization

- Remove the unused navigation-state review mode from `SubmitForm`.
- Fix the invalid `{ _t } = useTranslation()` destructuring where encountered in the contribution path.
- Add contribution copy to all supported locales so the completeness gate remains green.

## Data path

Add one migration that replaces the anonymous insert policy with a predicate allowing only `feedback` and `correction`, leaves anonymous reads unchanged, and ends with an assertion block. Corrections continue to enter the admin submissions queue while remaining excluded from the entity ingestion bridge.

## Verification

- Unit coverage for chooser routing, auth gating, page entity publication/cleanup, and correction payloads.
- Regression coverage for `/submit/place` and existing static submission routes.
- Update e2e selectors for the widened FAB label.
- Run tests, lint, typecheck, and the i18n completeness gate.
- Production-only insertion, RLS, inbox, and ingestion-staging checks are documented as pending unless production access is available.

