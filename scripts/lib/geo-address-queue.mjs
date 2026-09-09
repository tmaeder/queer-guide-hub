/**
 * Classification of parked `geo_address_queue` rows for check-pipeline-health.mjs.
 *
 * Pure and separately testable on purpose: the health script needs live service-role
 * credentials, so without this the first execution of the branching logic would be in
 * CI, on real data, at the moment someone is already blocked by a red check. Same
 * reasoning as scripts/lib/remote-migrations.mjs.
 *
 * WHAT THIS FIXES. The old rule was `parked > 0 → ✗`. Measured on prod 2026-09-09,
 * all 2,537 parked rows carried `last_error = 'no_postal_for_coordinates'` — Photon
 * answering that no postcode EXISTS for those coordinates. Those rows can never
 * drain, so the ✗ was permanent, `pipeline-health.yml` could not go green by any
 * amount of correct work, and a genuine wrong-entity regression sat underneath it
 * unread for six days.
 *
 * The teeth stay on the other arm. A row reaches `attempts >= 4` with any other
 * message only through the drain's catch branch — an HTTP 500, a timeout, a parse
 * error — and ONE such row fails. There is no threshold to tune and no baseline
 * allowance: a regression that parks 2,000 rows on HTTP 500 still exits 1.
 */

/** Written by exactly one branch of backfill-venue-cities, and only ever by it. */
export const TERMINAL_PARK_ERROR = 'no_postal_for_coordinates'

/**
 * @param {unknown} parked  the `geo_address_queue_parked()` envelope, or null/undefined
 *                          when the RPC could not be read.
 * @returns {{ level: 'ok'|'warn'|'fail', message: string }}
 */
export function classifyParkedQueue(parked) {
  // ABSENT IS NOT ZERO. An undeployed or unreadable sentinel must never read as a
  // clean corpus — the rule geo_hygiene_stats() states about an empty boundary set,
  // one function along. A missing envelope is a broken probe and fails.
  if (parked === null || parked === undefined || typeof parked !== 'object') {
    return {
      level: 'fail',
      message:
        'geo_address_queue_parked() returned nothing — the parked-queue classifier could not be read, so the postal queue is UNMEASURED, not clean',
    }
  }

  const transient = parked.transient
  const terminal = parked.terminal
  if (typeof transient !== 'number' || typeof terminal !== 'number') {
    return {
      level: 'fail',
      message: `geo_address_queue_parked() is missing the terminal/transient split (got ${JSON.stringify(parked)}) — migration 20360901100100 is not applied, so parked rows are UNCLASSIFIED`,
    }
  }

  if (transient > 0) {
    const errs = JSON.stringify(parked.transient_errors ?? {})
    const oldest = parked.oldest_transient_hours
    return {
      level: 'fail',
      message: `${transient} geo_address_queue rows parked at 4 attempts on a TRANSIENT failure${
        typeof oldest === 'number' ? ` (oldest ${oldest}h)` : ''
      } — the drain threw and exhausted its retries: ${errs}`,
    }
  }

  if (terminal > 0) {
    const types = JSON.stringify(parked.terminal_entity_types ?? {})
    return {
      level: 'warn',
      message: `${terminal} geo_address_queue rows parked as ${TERMINAL_PARK_ERROR} — Photon answered that no postcode exists for those coordinates, so they can never drain and are held deliberately (deleting one is how you re-offer it to a better geocoder): ${types}`,
    }
  }

  return { level: 'ok', message: 'No parked geo_address_queue rows' }
}
