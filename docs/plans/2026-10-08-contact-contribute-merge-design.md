# Contact contribution merge design

## Goal

Give users one contribution interface for feedback, page corrections, new entities,
flyer scanning, and private contact messages. Preserve `/contact` as a durable deep
link, but remove its independent form implementation.

## Chosen architecture

Add `contact` as a fifth `ContributeDialog` branch. Extract the existing Contact
form into one lazy-loaded `ContactBranch` component and render that component in
both dialog and page modes. `/contact` opens the contact branch directly;
`/contact?category=safety` continues to preselect Safety and moderation. A Back
action in page mode returns to the contribution chooser.

Contact remains anonymous-accessible but continues to require a name and reply
email. It keeps the existing `contact-form` Edge Function contract, rate limit,
authentication attribution, `contact_submissions` storage, and support email
notification. Contact data must not be moved into `community_submissions`.

## Unified experience

The chooser gains a fifth card, **Contact the team**, for account help,
moderation, partnerships, press, or another private message. The branch uses the
same station-board route signal, typography, spacing, card surfaces, form fields,
success treatment, sticky actions, focus states, and mobile bottom-sheet behavior
as the other contribution branches. It uses the roomy dialog layout.

The five existing contact categories stay visible as selectable cards rather than
a dropdown. A prominent ink crisis notice remains available for Safety and links
to `/help`. Security and legal remain direct alternatives in a compact
"Use a faster route" section. Links back to Submit and Feedback are removed from
the Contact branch because those destinations are sibling branches in the chooser.

The standalone Contact page layout and form are retired after these essential
safety, privacy, security, and legal routes are incorporated into the shared
branch.

## Verification

- Move the existing Contact unit coverage to the shared branch.
- Cover dialog and page-mode branch routing, category query parameters, validation,
  safety messaging, success state, and mobile layout.
- Run focused unit tests, lint, typecheck, i18n completeness, build, and local E2E.
- Verify `/contact`, `/contact?category=safety`, and chooser navigation on production.
- Do not send a real support message during production verification without an
  explicit request, because that would notify the support inbox.
