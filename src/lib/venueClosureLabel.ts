/**
 * The status chip a closed venue shows on its detail page.
 *
 * `closed_at` alone cannot tell a renovation from a shutdown: the closure
 * trigger stamps it for every status that counts as closed, including
 * `temporarily_closed` and `presumed_closed`. Reading only `closed_at` labelled
 * every one of them "Permanently closed", which is a false claim about a place
 * that is expected to reopen, or that we have no positive evidence about.
 * `closure_status` (vocabulary in `location_closure_statuses`) says which.
 */
export type ClosureLabel = 'temporarily_closed' | 'presumed_closed' | 'permanently_closed';

export function venueClosureLabel(venue: {
  closure_status?: string | null;
  closed_at?: string | null;
}): ClosureLabel | null {
  const status = venue.closure_status ?? null;
  if (status === 'temporarily_closed') return 'temporarily_closed';
  if (status === 'presumed_closed') return 'presumed_closed';
  const closedAt = venue.closed_at ? new Date(venue.closed_at) : null;
  const closedByDate = Boolean(closedAt && closedAt <= new Date());
  if (status === 'open' || status === 'unknown') return closedByDate ? 'permanently_closed' : null;
  if (status) return 'permanently_closed';
  return closedByDate ? 'permanently_closed' : null;
}
