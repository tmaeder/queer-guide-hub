/** Private, reversible review holds. A rollback never republishes unsupported material. */
const required = [
  'id',
  'name',
  'slug',
  'wikidata_qid',
  'birth_date',
  'description',
  'bio',
  'lgbti_details',
  'lgbti_connection',
  'profession',
  'pronouns',
  'visibility',
  'duplicate_of_id',
  'field_provenance',
  'lgbti_connection_source',
  'needs_attention',
  'seo_indexable',
];
export function validateReviewHolds(batch) {
  if (batch.review_holds === undefined) return;
  const fail = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  fail(
    batch.editorial_policy_version === 2 && Array.isArray(batch.review_holds),
    'Review holds require policy 2 and exact snapshots',
  );
  fail(
    batch.records.length + batch.review_holds.length <= 500,
    'Batch including holds exceeds 500 profiles',
  );
  const seen = new Set(batch.records.map((r) => r.id));
  for (const h of batch.review_holds) {
    fail(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(h.id) &&
        !seen.has(h.id),
      'Duplicate or invalid review hold',
    );
    seen.add(h.id);
    fail(h.before && required.every((f) => Object.hasOwn(h.before, f)), 'Incomplete hold snapshot');
    fail(
      Object.keys(h.before).every((f) => required.includes(f)),
      'Unsupported hold snapshot field',
    );
    fail(
      h.before.id === h.id &&
        h.before.name === h.name &&
        h.before.slug === h.slug &&
        h.before.visibility === 'public' &&
        h.before.duplicate_of_id === null,
      'Hold identity must match the public original',
    );
    fail(
      typeof h.reason === 'string' && h.reason.length >= 120 && h.status === 'needs_source_review',
      'Explain the evidence gap for each hold',
    );
    fail(
      Array.isArray(h.checked_sources) &&
        h.checked_sources.length > 0 &&
        h.checked_sources.every((s) => {
          try {
            return (
              new URL(s.url).protocol === 'https:' &&
              typeof s.finding === 'string' &&
              s.finding.length >= 60
            );
          } catch {
            return false;
          }
        }),
      'Review hold needs source-specific research findings',
    );
  }
}
export function reviewHoldPrelude(batch, literal, json) {
  if (!batch.review_holds?.length) return '';
  const payload = json(batch.review_holds);
  return `\n -- Review holds are private decisions, never claims about identity. Check every snapshot first.\n FOR r IN SELECT value FROM jsonb_array_elements(${payload}) ORDER BY value->>'id' LOOP
  SELECT * INTO STRICT p FROM public.personalities WHERE id=(r->>'id')::uuid FOR UPDATE;
  FOR f IN SELECT jsonb_object_keys(r->'before') LOOP
   IF to_jsonb(p)->f IS DISTINCT FROM r->'before'->f THEN RAISE EXCEPTION 'Review hold snapshot changed: % %',r->>'name',f; END IF;
  END LOOP;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(${payload}) ORDER BY value->>'id' LOOP
  UPDATE public.personalities SET visibility='draft',needs_attention=true,seo_indexable=false,
   field_provenance=coalesce(field_provenance,'{}'::jsonb)||jsonb_build_object('editorial_hold',jsonb_build_object('batch_id',${literal(batch.id)},'reviewer',${literal(batch.reviewer)},'reviewed_at',${literal(batch.reviewed_at)},'status',r->>'status','reason',r->>'reason','checked_sources',r->'checked_sources')),updated_at=now()
  WHERE id=(r->>'id')::uuid;
 END LOOP;\n`;
}
