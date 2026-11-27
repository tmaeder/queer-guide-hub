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
        (h.before.visibility === 'public' ||
          (h.before.visibility === 'draft' &&
            h.before.needs_attention === true &&
            h.before.seo_indexable === false &&
            (h.before.field_provenance?.editorial_hold ||
              batch.publication_assertions === 'strict'))) &&
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

/** A held record stays private until replacement text and its exact-person evidence exist. */
export function validateHoldRelease(r, policy) {
  const release = r.review_hold_release;
  if (!release) return;
  const fail = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const b = release.before;
  fail(
    policy === 2 && b && required.every((f) => Object.hasOwn(b, f)),
    'Incomplete held-release snapshot',
  );
  fail(
    b.id === r.id &&
      b.slug === r.slug &&
      b.visibility === 'draft' &&
      b.needs_attention === true &&
      b.seo_indexable === false &&
      b.duplicate_of_id === null &&
      b.field_provenance?.editorial_hold,
    'Only a documented private review hold can be released',
  );
  if (Object.hasOwn(release, 'clear_unverified_tags'))
    fail(
      release.clear_unverified_tags === true &&
        Array.isArray(b.tags) &&
        b.tags.length > 0 &&
        b.tags.every((t) => typeof t === 'string'),
      'Tag clearing needs an exact nonempty imported-tag snapshot',
    );
  const origin = r.identity_correction?.before || r.expected_identity;
  for (const f of ['name', 'slug', 'wikidata_qid', 'birth_date'])
    fail(b[f] === origin[f], `Release original identity mismatch: ${f}`);
  for (const f of Object.keys(r.changes))
    fail(
      b[f] === (r.identity_correction?.before || r.expected)[f],
      `Release text snapshot mismatch: ${f}`,
    );
  fail(
    JSON.stringify(b.field_provenance) === JSON.stringify(r.metadata_before.field_provenance) &&
      b.lgbti_connection_source === r.metadata_before.lgbti_connection_source,
    'Release provenance mismatch',
  );
  fail(
    ['description', 'bio', 'lgbti_details', 'lgbti_connection'].every(
      (f) =>
        typeof r.changes[f] === 'string' && (f === 'lgbti_connection' || r.changes[f] !== b[f]),
    ) &&
      ['description', 'bio', 'lgbti_details'].every(
        (f) => typeof r.translations?.de?.[f] === 'string',
      ),
    'Release requires complete replacement text in English and German',
  );
  fail(
    release.evidence?.status === 'reviewed' &&
      release.evidence.reason?.length >= 80 &&
      release.evidence.urls?.length > 0 &&
      release.evidence.urls.every((u) => r.sources.some((s) => s.url === u)),
    'Release needs reviewed exact-person source evidence',
  );
}
export function compileHoldRelease({ apply, rollback }, batch, literal, json) {
  if (!batch.records.some((r) => r.review_hold_release)) return { apply, rollback };
  const clearTags = batch.records.some((r) => r.review_hold_release?.clear_unverified_tags);
  const payload = json(batch.records.filter((r) => r.review_hold_release));
  const start = ` IF EXISTS(SELECT 1 FROM public.personality_sources WHERE source_slug=${literal('editorial-batch-' + batch.id)}) THEN RAISE EXCEPTION 'Batch already applied'; END IF;`;
  apply = apply.replace(
    start,
    start +
      `
 -- Validate every private original before metadata or text changes.
 FOR r IN SELECT value FROM jsonb_array_elements(${payload}) ORDER BY value->>'id' LOOP
  SELECT * INTO STRICT p FROM public.personalities WHERE id=(r->>'id')::uuid FOR UPDATE;
  FOR f IN SELECT jsonb_object_keys(r->'review_hold_release'->'before') LOOP
   IF to_jsonb(p)->f IS DISTINCT FROM r->'review_hold_release'->'before'->f THEN RAISE EXCEPTION 'Held-release snapshot changed: % %',r->>'name',f; END IF;
  END LOOP;
 END LOOP;
`,
  );
  apply = apply.replaceAll(
    "AND visibility='public' AND duplicate_of_id IS NULL FOR UPDATE;",
    "AND visibility=CASE WHEN r ? 'review_hold_release' THEN 'draft' ELSE 'public' END AND duplicate_of_id IS NULL FOR UPDATE;",
  );
  // Other production triggers may normalize a changed field. Never bind translations
  // or publish evidence to a value different from the reviewed manifest.
  apply = apply.replace(
    "  FOR lang,fields IN SELECT key,value FROM jsonb_each(r->'translations') LOOP\n   FOR f,v IN SELECT key,value FROM jsonb_each_text(fields) LOOP\n    UPDATE public.content_translations",
    `  SELECT * INTO STRICT p FROM public.personalities WHERE id=p.id;
  FOR f IN SELECT jsonb_object_keys(r->'changes') LOOP
   IF to_jsonb(p)->f IS DISTINCT FROM r->'changes'->f THEN RAISE EXCEPTION 'Production normalization differs from reviewed value: % %',r->>'name',f; END IF;
  END LOOP;
  FOR lang,fields IN SELECT key,value FROM jsonb_each(r->'translations') LOOP
   FOR f,v IN SELECT key,value FROM jsonb_each_text(fields) LOOP
    UPDATE public.content_translations`,
  );
  apply = apply.replace(
    'END $editorial$;',
    `
 -- Publication is last: guards now see replacement biographies, evidence and translations.
 FOR r IN SELECT value FROM jsonb_array_elements(${payload}) ORDER BY value->>'id' LOOP
  UPDATE public.personalities SET visibility='public',needs_attention=false,seo_indexable=true,
   field_provenance=field_provenance-'editorial_hold',updated_at=now() WHERE id=(r->>'id')::uuid;
 END LOOP;
END $editorial$;`,
  );
  const rollbackAnchor = rollback.includes("  IF r ? 'identity_correction' THEN\n   FOR f")
    ? "  IF r ? 'identity_correction' THEN\n   FOR f"
    : '  -- Restore canonical text before published translations are checked';
  rollback = rollback.replace(
    rollbackAnchor,
    `  IF r ? 'review_hold_release' THEN
   IF p.visibility IS DISTINCT FROM 'public' OR p.needs_attention IS DISTINCT FROM false OR p.seo_indexable IS DISTINCT FROM true OR p.field_provenance ? 'editorial_hold' THEN RAISE EXCEPTION 'Later publication edit protects held release: %',r->>'name'; END IF;
   UPDATE public.personalities SET visibility='draft',needs_attention=true,seo_indexable=false,
    field_provenance=field_provenance||jsonb_build_object('editorial_hold',r->'review_hold_release'->'before'->'field_provenance'->'editorial_hold') WHERE id=p.id;
  END IF;
${rollbackAnchor}`,
  );
  if (clearTags) {
    apply = apply.replace(
      "SET visibility='public',needs_attention=false,seo_indexable=true,",
      "SET visibility='public',needs_attention=false,seo_indexable=true,tags=CASE WHEN r->'review_hold_release'->>'clear_unverified_tags'='true' THEN '{}'::text[] ELSE tags END,",
    );
    rollback = rollback.replace(
      "   UPDATE public.personalities SET visibility='draft',needs_attention=true,seo_indexable=false,",
      `   IF r->'review_hold_release'->>'clear_unverified_tags'='true' THEN
    IF p.tags IS DISTINCT FROM '{}'::text[] THEN RAISE EXCEPTION 'Later tag edit protects held release: %',r->>'name'; END IF;
    UPDATE public.personalities SET tags=ARRAY(SELECT jsonb_array_elements_text(r->'review_hold_release'->'before'->'tags')) WHERE id=p.id;
   END IF;
   UPDATE public.personalities SET visibility='draft',needs_attention=true,seo_indexable=false,`,
    );
  }
  // Held originals may contain legacy published translations without approval. Never republish them.
  rollback = rollback.replace(
    "old=r->'expected_translations'->lang->f;",
    `old=r->'expected_translations'->lang->f; IF r ? 'review_hold_release' AND old->>'status'='published' THEN old=jsonb_set(old,'{status}','"draft"'::jsonb); END IF;`,
  );
  return { apply, rollback };
}
