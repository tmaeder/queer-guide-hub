# Resolve expected publisher occurrence copy

The current Review queue includes 406 DESCRIPTION_REUSED cases. Of these, 269
come from Siegessäule. The native detector already exempts the upcoming browse
series flag, but that flag is deliberately cleared when a date passes. Historical
occurrences therefore reappear as manual content problems even when the source
explicitly identifies a common program and its distinct dated occurrences.

Recognize this source identity directly, without altering browse grouping,
recurrence, schedules or content. Require the captured publisher series, source
ID and URL, title, description, timezone and exact Berlin occurrence timestamp
to match the canonical event. Require the same canonical city/country/venue
and at least three distinct instants across the whole description fingerprint.
Every member must carry the same valid publisher identity. An unrelated member,
missing capture, scope conflict, changed copy or invalid source refuses the whole
cluster. Other publishers remain under the current detector contract.

The native DESCRIPTION_REUSED detector uses this narrow exception. The existing
five-minute automatic resolver clears only untouched findings from its own native
detector after a locked-row recheck. Keep original evidence and human attribution,
record full before/after repair journals and captured source URLs/hashes, and
remove only this code from the current quality cache. Preserve existing pause,
lease and batch limits. New or changed source facts restore the normal detector
finding; there is no permanent dismissal or future recurrence inference.

Validation: the real migration passes 15 disposable PostgreSQL source cohorts,
including conflicting siblings, missing values, exact occurrence identity, DST,
manual/external findings, browser permissions, pause, idempotency, evidence and
event/source row preservation. A production rehearsal using temporary compiled
functions resolved 136 eligible findings and rolled back all changes. Permanent
functions and recurring cleanup remain pending normal protected deployment.
