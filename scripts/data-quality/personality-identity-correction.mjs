import { isDeepStrictEqual } from 'node:util';
/** Exact-snapshot metadata corrections, applied atomically with reviewed replacement text. */
const allowed = new Set([
  'name',
  'wikidata_qid',
  'birth_date',
  'death_date',
  'is_living',
  'image_url',
  'image_status',
  'nationality',
  'wikipedia_url',
  'profile_url',
  'birth_place',
  'death_place',
  'cause_of_death',
  'profession',
  'pronouns',
]);
const identityFields = ['name', 'wikidata_qid', 'birth_date'];
const own = (v, k) => Object.hasOwn(v, k);
const fail = (ok, message) => {
  if (!ok) throw new Error(message);
};
export function validateIdentityCorrection(record, policy) {
  const c = record.identity_correction;
  if (!c) return;
  fail(policy === 2, 'Identity corrections require editorial policy 2');
  fail(
    c && typeof c === 'object' && c.before && c.after && c.evidence,
    'Missing identity correction snapshots',
  );
  fail(
    c.evidence.status === 'reviewed' &&
      typeof c.evidence.reason === 'string' &&
      c.evidence.reason.length >= 80,
    'Explain the reviewed identity correction',
  );
  fail(
    Array.isArray(c.evidence.urls) &&
      c.evidence.urls.length > 0 &&
      c.evidence.urls.every((u) => record.sources.some((s) => s.url === u)),
    'Identity correction needs reviewed source URLs',
  );
  fail(Object.keys(c.after).length > 0, 'Empty identity correction');
  for (const [field, value] of Object.entries(c.after)) {
    fail(allowed.has(field) && own(c.before, field), `Unsupported identity correction: ${field}`);
    fail(
      value === null ||
        typeof value === 'string' ||
        (field === 'is_living' && typeof value === 'boolean'),
      `Invalid correction: ${field}`,
    );
    fail(value !== c.before[field], `Unchanged correction: ${field}`);
    if (field === 'is_living')
      fail(
        value === null || typeof value === 'boolean',
        'Use a reviewed boolean or clear an unverified living status',
      );
    if (field === 'wikidata_qid')
      fail(value === null || /^Q\d+$/.test(value), 'Invalid corrected QID');
    if (field.endsWith('_date'))
      fail(value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Invalid corrected date');
    if (
      [
        'image_url',
        'nationality',
        'wikipedia_url',
        'profile_url',
        'birth_place',
        'death_place',
        'cause_of_death',
        'profession',
        'pronouns',
      ].includes(field)
    )
      fail(value === null, `Clear unverified ${field}; review replacements separately`);
    if (field === 'image_status') fail(value === 'rejected', 'Wrong portraits must be rejected');
  }
  for (const field of ['name', 'slug', 'wikidata_qid', 'birth_date']) {
    fail(own(c.before, field), `Missing original identity: ${field}`);
    fail(
      record.expected_identity[field] === (own(c.after, field) ? c.after[field] : c.before[field]),
      `Correction target differs from reviewed identity: ${field}`,
    );
  }
  fail(c.before.slug === record.slug, 'Identity correction cannot change URLs');
  const changedIdentity = identityFields.some((f) => own(c.after, f));
  if (changedIdentity) {
    fail(
      typeof record.changes.bio === 'string' && record.translations.de?.bio,
      'Changed identity needs a reviewed replacement biography and German translation',
    );
    for (const f of ['profession', 'pronouns']) {
      fail(own(c.before, f), `Snapshot ${f} before identity correction`);
      const target = own(c.after, f) ? c.after[f] : c.before[f];
      fail(
        target === null || own(record.changes, f),
        `Re-review or clear ${f} after identity correction`,
      );
    }
  }
  for (const f of Object.keys(record.changes)) {
    fail(own(c.before, f), `Snapshot text before identity correction: ${f}`);
    fail(
      record.expected[f] === (own(c.after, f) ? c.after[f] : c.before[f]),
      `Correction text snapshot mismatch: ${f}`,
    );
  }
  fail(
    isDeepStrictEqual(record.metadata_before.field_provenance, c.before.field_provenance) &&
      record.metadata_before.lgbti_connection_source === c.before.lgbti_connection_source,
    'Correction metadata snapshot mismatch',
  );
  for (const f of ['field_provenance', 'lgbti_connection_source'])
    fail(own(c.before, f), `Snapshot metadata before identity correction: ${f}`);
}
export function correctionPrelude(payload) {
  const assignments = [...allowed]
    .map(
      (f) =>
        `${f}=CASE WHEN r->'identity_correction'->'after' ? '${f}' THEN ${f.endsWith('_date') || f === 'is_living' ? `(r->'identity_correction'->'after'->>'${f}')::${f === 'is_living' ? 'boolean' : 'date'}` : `r->'identity_correction'->'after'->>'${f}'`} ELSE ${f} END`,
    )
    .join(',');
  return `\n -- Lock every reviewed row before any identity change; a concurrent edit aborts the batch.\n FOR r IN SELECT value FROM jsonb_array_elements(${payload}) ORDER BY value->>'id' LOOP\n  SELECT * INTO STRICT p FROM public.personalities WHERE id=(r->>'id')::uuid AND visibility='public' AND duplicate_of_id IS NULL FOR UPDATE;\n  IF r ? 'identity_correction' THEN\n   FOR f IN SELECT jsonb_object_keys(r->'identity_correction'->'before') LOOP\n    IF to_jsonb(p)->f IS DISTINCT FROM r->'identity_correction'->'before'->f THEN RAISE EXCEPTION 'Identity correction snapshot changed: % %',r->>'name',f; END IF;\n   END LOOP;\n   FOR lang,fields IN SELECT key,value FROM jsonb_each(r->'expected_translations') LOOP\n    FOR f,v IN SELECT key,value FROM jsonb_each_text(fields) LOOP\n     SELECT jsonb_build_object('value',value,'status',status,'machine_source',machine_source,'source_hash',source_hash,'source_lang',source_lang,'editorial_reviewed_by',editorial_reviewed_by,'editorial_reviewed_at',editorial_reviewed_at,'editorial_reviewed_value',editorial_reviewed_value,'editorial_reviewed_identity',editorial_reviewed_identity) INTO current_translation FROM public.content_translations WHERE table_name='personalities' AND record_id=p.id AND field_name=f AND language=lang FOR UPDATE;\n     IF coalesce(current_translation,'null'::jsonb) IS DISTINCT FROM fields->f THEN RAISE EXCEPTION 'Identity translation snapshot changed: % %.%',r->>'name',lang,f; END IF;\n    END LOOP;\n   END LOOP;\n  END IF;\n END LOOP;\n FOR r IN SELECT value FROM jsonb_array_elements(${payload}) WHERE value ? 'identity_correction' ORDER BY value->>'id' LOOP\n  UPDATE public.personalities SET ${assignments},updated_at=now() WHERE id=(r->>'id')::uuid;\n END LOOP;\n`;
}
export function correctionRollbackTail(payload) {
  const assignments = [...allowed]
    .map(
      (f) =>
        `${f}=CASE WHEN r->'identity_correction'->'after' ? '${f}' THEN ${f.endsWith('_date') || f === 'is_living' ? `(r->'identity_correction'->'before'->>'${f}')::${f === 'is_living' ? 'boolean' : 'date'}` : `r->'identity_correction'->'before'->>'${f}'`} ELSE ${f} END`,
    )
    .join(',');
  return `\n FOR r IN SELECT value FROM jsonb_array_elements(${payload}) WHERE value ? 'identity_correction' ORDER BY value->>'id' LOOP\n  UPDATE public.personalities SET ${assignments},updated_at=now() WHERE id=(r->>'id')::uuid;\n END LOOP;\n`;
}
