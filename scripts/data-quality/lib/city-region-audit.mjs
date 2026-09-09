/**
 * Audit payload for the city region_name backfill.
 *
 * Extracted from `backfill-city-region.mjs` for ONE reason: that script does its
 * work in top-level `await`, so importing it runs the whole sweep. The property
 * this payload has to hold is the one that took the scheduled job down on every
 * run it ever had, and it should be asserted by a unit test rather than by a
 * cron at 02:35 UTC.
 *
 * THE PROPERTY. `external_correction_audit.before_value` is `jsonb NOT NULL`,
 * and the jsonb scalar 'null' is how the schema spells "the column was empty",
 * kept deliberately distinct from "we failed to capture the value".
 * `rollback_external_correction_batch` keys on `$2 = 'null'::jsonb`.
 *
 * That value cannot be written through a plain PostgREST insert. Measured
 * against this project's own PostgREST, into this exact column:
 *
 *   {"before_value": null}     -> SQL NULL, 23502, the run dies
 *   {"before_value": "null"}   -> jsonb *string*, `= 'null'::jsonb` is false
 *   text/csv bare  null        -> jsonb *string*, same
 *
 * Only the first fails loudly. The other two would leave an audit row whose
 * before-image is the four-character string "null", which a rollback would
 * restore into `cities.region_name` — a silently wrong audit trail, which is
 * worse than a failed insert. So the rows go through the
 * `record_external_corrections` RPC, which reads them with `->` and therefore
 * keeps an explicit null distinct from an absent key.
 *
 * Hence the invariant asserted downstream: every row carries `before_value` as
 * an EXPLICIT JSON null. Never omit the key — omission is a different claim and
 * the RPC raises on it rather than assuming the column was empty.
 */
export function buildAuditRows(chunk, batchId) {
  return chunk.map((r) => ({
    batch_id: batchId,
    entity_type: 'city',
    entity_id: r.id,
    field: 'region_name',
    before_value: null,
    after_value: r.state,
    source: 'photon-reverse',
    actor: 'script:backfill-city-region',
    reason: 'fill empty region_name by reverse geocode',
  }));
}
