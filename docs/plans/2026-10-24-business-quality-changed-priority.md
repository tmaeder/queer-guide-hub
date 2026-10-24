# Reassess changed business facts promptly

The quality worker admits changed profiles but previously sorted every candidate only by its last check time. A newly corrected profile could wait behind more than 80,000 daily stale checks, leaving an inaccurate review finding visible after enrichment.

The immutable migration prioritizes profiles changed after their last assessment, then unchecked profiles, then the daily stale backlog. Eligibility, the 2,000-profile bound, the existing lease, scoring and source protections remain unchanged. No profile data or finding is changed by the migration.

The isolated PostgreSQL regression reproduces a recent correction excluded behind 2,001 older profiles, then verifies the correction is selected first, unchecked work remains ahead of daily checks, duplicates remain excluded and the batch bound and function security are preserved.
