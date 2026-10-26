# Preserve venue-type amenities in the CMS

Production's Gay Bar amenity (`gay-bar`) has Kind `venue_type`, which the database constraint accepts. The CMS Kind select lists only `amenity`, `accessibility`, and `queer`, and its generated validation rejects the stored value before an unrelated label edit can save.

Add the missing `venue_type` option to the amenity registry. Keep the finite allowlist and preserve existing classification data. Reclassifying Gay Bar as `amenity` would change its meaning and routing; allowing arbitrary strings would discard useful validation. Neither is needed.

Regression coverage validates a Gay Bar label edit with the original Kind and rejects unsupported kinds. The existing isolated Place amenities E2E case creates a `venue_type` fixture, edits its label, verifies Kind after both reloads and independently in the database, then runs the existing verified cleanup.

Release through the repository's CI and Cloudflare Pages workflow. Verify the deployed build ID, edit the production Gay Bar label, reload and reopen it, restore the original label, then reload again. Independently confirm Kind, slug, category scope, active state and other content values are unchanged. Preserve normal audit history.
