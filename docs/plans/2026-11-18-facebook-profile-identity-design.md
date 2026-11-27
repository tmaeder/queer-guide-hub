# Preserve Facebook profile identities

Approved scope: preserve Facebook profile IDs and legacy page paths in the
browser and Edge Function social URL helpers, with regression checks.

The Pride Places import contains 85 structured Facebook URLs. The current
normalizer turns `profile.php?id=…` into `profile.php`, and a legacy
`people/<name>/<id>` path into `people`. Both lose the account identity.

## Decision

Use a Facebook-specific identifier parser before the ordinary single-handle
parser. Preserve the numeric `id` parameter of `profile.php` and the complete
native path for `people`, `pages`, and `groups` URLs. Keep IDs as strings.
Discard tracking parameters rather than discarding identity parameters.

The alternative was to defer these source links until application code changed.
The user approved the focused normalizer fix on 18 November 2026.

## Invariants

- Browser and Edge Function helpers produce equivalent identifiers and URLs.
- Different numeric profile IDs never collapse to the same URL.
- Legacy page paths retain their identifying path segments.
- Recovering a profile from a Facebook login wall retains its profile ID.
- Existing ordinary handles and share/login rejection behavior remain covered.
- No new dependencies or data schema changes are needed.

## Verification

Run the existing social registry suite and focused cases against both helpers.
Exercise direct numeric profiles, legacy paths, tracking parameters, large IDs,
and login-wall recovery. Replay the structured URLs collected in the import to
check that their identities survive normalization.
