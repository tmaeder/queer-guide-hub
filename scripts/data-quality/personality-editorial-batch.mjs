/** Reviewed editorial batches. Run with `node --import tsx ...`. No implicit writes. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  detectPersonalityLanguage,
  hasMixedScriptWord,
} from '../../src/lib/personalityLanguage.ts';

const FIELDS = [
  'description',
  'bio',
  'lgbti_details',
  'lgbti_connection',
  'profession',
  'pronouns',
];
const CATEGORIES = ['community_member', 'activist', 'ally', 'representation'];
const LANGUAGES = ['de', 'fr', 'it', 'es', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'];
const BASIS = ['identity', 'activism', 'allyship', 'cultural_work'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nonempty = (v) => typeof v === 'string' && !!v.trim();
const canonical = (value) =>
  JSON.stringify(value, (_k, v) =>
    object(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
const digest = (value) => createHash('sha256').update(value).digest('hex');
export const batchDigest = (batch) => digest(canonical(batch));
const literal = (value) =>
  value === null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";
const json = (value) => literal(JSON.stringify(value)) + '::jsonb';

export function validateBatch(batch) {
  assert(object(batch), 'Batch must be an object');
  assert(batch.schema_version === 1, 'Unsupported schema_version');
  assert(/^[a-z0-9][a-z0-9-]{3,79}$/.test(batch.id), 'Invalid batch id');
  assert(
    Array.isArray(batch.records) && batch.records.length > 0 && batch.records.length <= 100,
    'Batch must contain 1–100 records',
  );
  assert(
    nonempty(batch.reviewer) &&
      !Number.isNaN(Date.parse(batch.reviewed_at)) &&
      Date.parse(batch.reviewed_at) <= Date.now() + 60000,
    'Batch needs a dated source review',
  );
  const seen = new Set();
  for (const r of batch.records) {
    const prefix = r.name || r.id;
    assert(uuid.test(r.id) && !seen.has(r.id), `Duplicate or invalid id: ${prefix}`);
    seen.add(r.id);
    assert(nonempty(r.name) && nonempty(r.slug), `Missing exact-person reference: ${prefix}`);
    assert(
      r.review?.status === 'reviewed' && BASIS.includes(r.review.connection_basis),
      `Unreviewed evidence: ${prefix}`,
    );
    assert(
      object(r.expected) && object(r.metadata_before) && object(r.metadata_before.field_provenance),
      `Missing original snapshot: ${prefix}`,
    );
    assert(object(r.changes) && Object.keys(r.changes).length > 0, `No changes: ${prefix}`);
    assert(
      nonempty(r.changes.description) &&
        r.changes.description.length >= 120 &&
        r.changes.description.length <= 240,
      `Summary must be 120–240 characters: ${prefix}`,
    );
    assert(nonempty(r.changes.lgbti_details), `Missing connection explanation: ${prefix}`);
    for (const [field, value] of Object.entries(r.changes)) {
      assert(
        FIELDS.includes(field) && Object.hasOwn(r.expected, field),
        `Missing original or unsupported field ${field}: ${prefix}`,
      );
      assert(
        r.expected[field] === null || typeof r.expected[field] === 'string',
        `Invalid original ${field}: ${prefix}`,
      );
      assert(nonempty(value), `Empty ${field}: ${prefix}`);
      if (['description', 'bio', 'lgbti_details'].includes(field)) {
        assert(!hasMixedScriptWord(value), `Mixed-script word in ${field}: ${prefix}`);
        const languages = new Set(
          value
            .split(/\n+|(?<=[.!?])\s+/)
            .filter((s) => s.length >= 60)
            .map(detectPersonalityLanguage)
            .filter(Boolean),
        );
        assert(
          [...languages].every((l) => l === 'en'),
          `Review canonical English in ${field}: ${prefix}`,
        );
      }
    }
    if (r.changes.lgbti_connection) {
      assert(
        Object.hasOwn(r.metadata_before, 'lgbti_connection_source'),
        `Missing connection-source snapshot: ${prefix}`,
      );
      assert(
        CATEGORIES.includes(r.changes.lgbti_connection),
        `Invalid connection category: ${prefix}`,
      );
      const expectedBasis = {
        community_member: 'identity',
        activist: 'activism',
        ally: 'allyship',
        representation: 'cultural_work',
      };
      assert(
        r.review.connection_basis === expectedBasis[r.changes.lgbti_connection],
        `Category/evidence mismatch: ${prefix}`,
      );
    }
    assert(Array.isArray(r.sources) && r.sources.length > 0, `Missing sources: ${prefix}`);
    const supported = new Set();
    const sourceUrls = new Set();
    for (const s of r.sources) {
      assert(!sourceUrls.has(s.url), `Duplicate source URL: ${prefix}`);
      sourceUrls.add(s.url);
      let url;
      try {
        url = new URL(s.url);
      } catch {
        throw new Error(`Invalid source URL: ${prefix}`);
      }
      assert(
        url.protocol === 'https:' &&
          !url.username &&
          !url.password &&
          !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
        `Unsafe source URL: ${prefix}`,
      );
      assert(
        s.identity_match === 'exact' && nonempty(s.title) && nonempty(s.basis),
        `Source identity/basis not reviewed: ${prefix}`,
      );
      assert(
        !Number.isNaN(Date.parse(s.checked_at)) && Date.parse(s.checked_at) <= Date.now() + 60000,
        `Source check date missing: ${prefix}`,
      );
      assert(Array.isArray(s.fields) && s.fields.length > 0, `No source field support: ${prefix}`);
      for (const f of s.fields) {
        assert(Object.hasOwn(r.changes, f), `Source claims untouched field ${f}: ${prefix}`);
        supported.add(f);
      }
    }
    for (const f of Object.keys(r.changes))
      assert(supported.has(f), `Missing field-specific evidence for ${f}: ${prefix}`);
    assert(
      object(r.translations) && Object.keys(r.translations).length > 0,
      `Missing reviewed translations: ${prefix}`,
    );
    for (const [lang, fields] of Object.entries(r.translations)) {
      assert(
        LANGUAGES.includes(lang) && r.review.translation_languages?.includes(lang),
        `Unreviewed translation ${lang}: ${prefix}`,
      );
      assert(
        nonempty(fields.description) && nonempty(fields.lgbti_details),
        `Incomplete translated context ${lang}: ${prefix}`,
      );
      for (const [f, value] of Object.entries(fields)) {
        assert(
          Object.hasOwn(r.changes, f) && f !== 'lgbti_connection' && nonempty(value),
          `Invalid translation ${lang}.${f}: ${prefix}`,
        );
        assert(
          Object.hasOwn(r.expected_translations?.[lang] || {}, f),
          `Missing translation snapshot ${lang}.${f}: ${prefix}`,
        );
        const old = r.expected_translations[lang][f];
        assert(
          old === null ||
            (object(old) &&
              typeof old.value === 'string' &&
              nonempty(old.status) &&
              Object.hasOwn(old, 'machine_source')),
          `Invalid translation snapshot ${lang}.${f}: ${prefix}`,
        );
        assert(!hasMixedScriptWord(value), `Mixed-script translation ${lang}.${f}: ${prefix}`);
        const detected = detectPersonalityLanguage(value);
        assert(
          !detected ||
            detected === lang ||
            (detected === 'en' && r.review.language_exceptions?.includes(`${lang}.${f}`)),
          `Review translation language ${lang}.${f}: ${prefix}`,
        );
      }
    }
  }
  return {
    id: batch.id,
    digest: batchDigest(batch),
    profiles: batch.records.length,
    translations: batch.records.reduce(
      (n, r) => n + Object.values(r.translations).reduce((a, v) => a + Object.keys(v).length, 0),
      0,
    ),
  };
}

export function compileBatch(batch) {
  const summary = validateBatch(batch);
  const marker = `editorial-batch-${batch.id}`;
  const payload = json(batch.records);
  const assignments = FIELDS.map(
    (f) => `${f}=CASE WHEN r->'changes' ? '${f}' THEN r->'changes'->>'${f}' ELSE ${f} END`,
  ).join(',\n      ');
  const restore = FIELDS.map(
    (f) => `${f}=CASE WHEN r->'changes' ? '${f}' THEN r->'expected'->>'${f}' ELSE ${f} END`,
  ).join(',\n      ');
  const apply = `-- Reviewed batch ${batch.id}; sha256 ${summary.digest}\nDO $editorial$\nDECLARE r jsonb; p public.personalities%ROWTYPE; s jsonb; sid uuid; f text; lang text; fields jsonb; v text; old jsonb; current_translation jsonb; citations jsonb; provenance jsonb;\nBEGIN
 PERFORM pg_advisory_xact_lock(hashtext(${literal(marker)}));
 IF EXISTS(SELECT 1 FROM public.personality_sources WHERE source_slug=${literal(marker)}) THEN RAISE EXCEPTION 'Batch already applied'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(${payload}) ORDER BY value->>'id' LOOP
  SELECT * INTO STRICT p FROM public.personalities WHERE id=(r->>'id')::uuid AND visibility='public' AND duplicate_of_id IS NULL FOR UPDATE;
  FOR f IN SELECT jsonb_object_keys(r->'changes') LOOP
   IF to_jsonb(p)->f IS DISTINCT FROM r->'expected'->f OR coalesce(p.field_provenance,'{}'::jsonb)->f IS DISTINCT FROM r->'metadata_before'->'field_provenance'->f THEN RAISE EXCEPTION 'Profile changed since review: % %',r->>'name',f; END IF;
  END LOOP;
  IF r->'changes' ? 'lgbti_connection' AND p.lgbti_connection_source IS DISTINCT FROM r->'metadata_before'->>'lgbti_connection_source' THEN RAISE EXCEPTION 'Connection source changed: %',r->>'name'; END IF;
  FOR lang,fields IN SELECT key,value FROM jsonb_each(r->'translations') LOOP
   FOR f,v IN SELECT key,value FROM jsonb_each_text(fields) LOOP
    SELECT jsonb_build_object('value',value,'status',status,'machine_source',machine_source) INTO current_translation FROM public.content_translations WHERE table_name='personalities' AND record_id=p.id AND field_name=f AND language=lang FOR UPDATE;
    old=r->'expected_translations'->lang->f;
    IF coalesce(current_translation,'null'::jsonb) IS DISTINCT FROM old THEN RAISE EXCEPTION 'Translation changed since review: % %.%',r->>'name',lang,f; END IF;
   END LOOP;
  END LOOP;
  provenance='{}'::jsonb;
  FOR s IN SELECT value FROM jsonb_array_elements(r->'sources') LOOP
   INSERT INTO public.personality_sources(personality_id,source_slug,source_entity_id,source_url,raw,confidence,is_primary) VALUES(p.id,${literal(marker)},coalesce(p.wikidata_qid,p.id::text)||'#'||md5(s->>'url'),s->>'url',jsonb_build_object('batch_id',${literal(batch.id)},'batch_digest',${literal(summary.digest)},'reviewer',${literal(batch.reviewer)},'source_title',s->>'title','checked_at',s->>'checked_at','reviewed_basis',s->>'basis','connection_basis',r->'review'->>'connection_basis'),0.99,false) RETURNING id INTO sid;
   FOR f IN SELECT jsonb_array_elements_text(s->'fields') LOOP
    INSERT INTO public.personality_claim_sources(personality_id,field_name,source_id,confidence,verification_status,checked_at) VALUES(p.id,f,sid,0.99,'verified',now());
    citations=coalesce(provenance->f->'citations','[]'::jsonb)||jsonb_build_array(jsonb_build_object('source_id',sid,'state','verified'));
    provenance=provenance||jsonb_build_object(f,jsonb_build_object('source','verified-source-review','source_id',sid,'source_url',s->>'url','confidence',0.99,'approved_at',now(),'citations',citations));
   END LOOP;
  END LOOP;
  UPDATE public.personalities SET ${assignments},
   lgbti_connection_source=CASE WHEN r->'changes' ? 'lgbti_connection' THEN provenance->'lgbti_connection'->>'source_url' ELSE lgbti_connection_source END,
   field_provenance=coalesce(field_provenance,'{}'::jsonb)||provenance,updated_at=now() WHERE id=p.id;
  FOR lang,fields IN SELECT key,value FROM jsonb_each(r->'translations') LOOP
   FOR f,v IN SELECT key,value FROM jsonb_each_text(fields) LOOP
    UPDATE public.content_translations SET value=v,status='published',machine_source=${literal(marker)} WHERE table_name='personalities' AND record_id=p.id AND field_name=f AND language=lang;
    IF NOT FOUND THEN INSERT INTO public.content_translations(table_name,record_id,field_name,language,value,status,machine_source) VALUES('personalities',p.id,f,lang,v,'published',${literal(marker)}); END IF;
   END LOOP;
  END LOOP;
 END LOOP;
END $editorial$;\n`;
  const rollback = `-- Rollback only this batch; later edits and evidence block the whole transaction.\nDO $rollback$\nDECLARE r jsonb; p public.personalities%ROWTYPE; f text; lang text; fields jsonb; v text; old jsonb; current_translation jsonb;\nBEGIN
 PERFORM pg_advisory_xact_lock(hashtext(${literal(marker)}));
 FOR r IN SELECT value FROM jsonb_array_elements(${payload}) ORDER BY value->>'id' LOOP
  SELECT * INTO STRICT p FROM public.personalities WHERE id=(r->>'id')::uuid FOR UPDATE;
  FOR f IN SELECT jsonb_object_keys(r->'changes') LOOP
   IF to_jsonb(p)->f IS DISTINCT FROM r->'changes'->f OR NOT EXISTS(SELECT 1 FROM public.personality_sources WHERE id=(p.field_provenance->f->>'source_id')::uuid AND personality_id=p.id AND source_slug=${literal(marker)}) THEN RAISE EXCEPTION 'Later edit protects profile: % %',r->>'name',f; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.personality_sources s JOIN public.personality_claim_sources c ON c.source_id=s.id WHERE s.personality_id=p.id AND s.source_slug=${literal(marker)} AND NOT(r->'changes' ? c.field_name)) THEN RAISE EXCEPTION 'Later source use protects profile: %',r->>'name'; END IF;
  FOR lang,fields IN SELECT key,value FROM jsonb_each(r->'translations') LOOP
   FOR f,v IN SELECT key,value FROM jsonb_each_text(fields) LOOP
    SELECT jsonb_build_object('value',value,'status',status,'machine_source',machine_source) INTO current_translation FROM public.content_translations WHERE table_name='personalities' AND record_id=p.id AND field_name=f AND language=lang FOR UPDATE;
    IF current_translation IS DISTINCT FROM jsonb_build_object('value',v,'status','published','machine_source',${literal(marker)}) THEN RAISE EXCEPTION 'Later edit protects translation: % %.%',r->>'name',lang,f; END IF;
    old=r->'expected_translations'->lang->f;
    IF old='null'::jsonb THEN DELETE FROM public.content_translations WHERE table_name='personalities' AND record_id=p.id AND field_name=f AND language=lang;
    ELSE UPDATE public.content_translations SET value=old->>'value',status=old->>'status',machine_source=old->>'machine_source' WHERE table_name='personalities' AND record_id=p.id AND field_name=f AND language=lang; END IF;
   END LOOP;
  END LOOP;
  UPDATE public.personalities SET ${restore},
   lgbti_connection_source=CASE WHEN r->'changes' ? 'lgbti_connection' THEN r->'metadata_before'->>'lgbti_connection_source' ELSE lgbti_connection_source END,
   field_provenance=(coalesce(field_provenance,'{}'::jsonb)-ARRAY(SELECT jsonb_object_keys(r->'changes')))||coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(r->'metadata_before'->'field_provenance') WHERE r->'changes' ? key),'{}'::jsonb),updated_at=now() WHERE id=p.id;
  DELETE FROM public.personality_sources WHERE personality_id=p.id AND source_slug=${literal(marker)};
 END LOOP;
END $rollback$;\n`;
  const wrap = (sql, old) => {
    let tag = `$qg_${summary.digest.slice(0, 16)}$`;
    while (sql.includes(tag)) tag = tag.slice(0, -1) + '_x$';
    return sql
      .replace(`DO $${old}$`, `DO ${tag}`)
      .replace(new RegExp(`END \\$${old}\\$;\\n$`), `END ${tag};\n`);
  };
  return { summary, apply: wrap(apply, 'editorial'), rollback: wrap(rollback, 'rollback') };
}

export function prepareBatch(batch, directory) {
  const result = compileBatch(batch);
  result.summary = {
    ...result.summary,
    compiler_version: 2,
    apply_sha256: digest(result.apply),
    rollback_sha256: digest(result.rollback),
  };
  mkdirSync(directory, { recursive: true });
  const sealPath = join(directory, 'prepared.json');
  if (existsSync(sealPath))
    assert(
      canonical(JSON.parse(readFileSync(sealPath, 'utf8'))) === canonical(result.summary),
      'Frozen batch changed; use a new batch id',
    );
  writeFileSync(join(directory, 'apply.sql'), result.apply);
  writeFileSync(join(directory, 'rollback.sql'), result.rollback);
  writeFileSync(join(directory, 'review.json'), JSON.stringify(batch, null, 2) + '\n');
  writeFileSync(sealPath, JSON.stringify(result.summary, null, 2) + '\n');
  return result.summary;
}

export function assertPublishableKey(key) {
  if (key.startsWith('sb_publishable_')) return;
  let role;
  try {
    role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role;
  } catch {
    /* Invalid tokens are rejected below. */
  }
  assert(role === 'anon', 'Anonymous verification requires a publishable or legacy anon key');
}

function publicConfig() {
  const source = readFileSync(
    new URL('../../src/integrations/supabase/client.ts', import.meta.url),
    'utf8',
  );
  const url =
    process.env.SUPABASE_URL ||
    source.match(/(?:const|export const) SUPABASE_URL[\s\S]*?['"](https:\/\/[^'"]+)['"]/)?.[1];
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    source.match(/const SUPABASE_PUBLISHABLE_KEY[\s\S]*?['"](eyJ[^'"]+)['"]/)?.[1];
  assert(url && key, 'Public website credentials unavailable');
  assertPublishableKey(key);
  return { url, key };
}
export async function queueBatch(
  audit,
  batchId,
  limit = 20,
  request = globalThis.fetch,
  config = publicConfig(),
) {
  assert(
    Array.isArray(audit.records) && Number.isInteger(limit) && limit > 0 && limit <= 100,
    'Queue requires an audit and a limit of 1–100',
  );
  const pending = new Set(
    audit.records
      .filter((r) => r.issues.includes('missing_connection_explanation'))
      .map((r) => r.id),
  );
  const rows = [];
  for (let offset = 0; rows.length < limit; offset += 100) {
    const params = new URLSearchParams({
      select: `id,name,slug,wikidata_qid,${FIELDS.join(',')},field_provenance,lgbti_connection_source,wikipedia_url,profile_url`,
      visibility: 'eq.public',
      duplicate_of_id: 'is.null',
      or: '(is_adult.is.null,is_adult.eq.false)',
      order: 'is_featured.desc,view_count.desc.nullslast,name.asc',
      limit: '100',
      offset: String(offset),
    });
    const response = await request(`${config.url}/rest/v1/personalities?${params}`, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
    });
    assert(response.ok, `Queue snapshot failed: ${response.status}`);
    const page = await response.json();
    rows.push(...page.filter((r) => pending.has(r.id) && !r.lgbti_details?.trim()));
    if (page.length < 100) break;
  }
  return {
    schema_version: 1,
    id: batchId,
    reviewer: '',
    reviewed_at: null,
    records: rows.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      expected: Object.fromEntries(FIELDS.map((f) => [f, r[f] ?? null])),
      metadata_before: {
        field_provenance: r.field_provenance || {},
        lgbti_connection_source: r.lgbti_connection_source ?? null,
      },
      changes: { description: '', lgbti_details: '', lgbti_connection: '' },
      sources: [],
      research_hints: [r.wikipedia_url, r.profile_url].filter(Boolean),
      translations: { de: { description: '', lgbti_details: '' } },
      expected_translations: {
        de: { description: { unreviewed: true }, lgbti_details: { unreviewed: true } },
      },
      review: { status: 'draft', connection_basis: null, translation_languages: [] },
    })),
  };
}

export async function verifyBatch(batch, request = globalThis.fetch, config = publicConfig()) {
  const summary = validateBatch(batch);
  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    'Content-Type': 'application/json',
  };
  const ids = batch.records.map((r) => r.id);
  const read = await request(
    `${config.url}/rest/v1/personalities?id=in.(${ids.join(',')})&select=id,${FIELDS.join(',')}`,
    { headers },
  );
  assert(read.ok, `Public profile read failed: ${read.status}`);
  const profiles = await read.json();
  for (const r of batch.records) {
    const p = profiles.find((p) => p.id === r.id);
    assert(p, `Public profile absent: ${r.name}`);
    for (const [f, v] of Object.entries(r.changes))
      assert(p[f] === v, `Published value mismatch: ${r.name} ${f}`);
  }
  for (const lang of new Set([
    'en',
    ...batch.records.flatMap((r) => Object.keys(r.translations)),
  ])) {
    const response = await request(`${config.url}/rest/v1/rpc/personality_public_editorial`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_ids: ids, p_lang: lang }),
    });
    assert(response.ok, `Public editorial read failed: ${response.status}`);
    const rows = await response.json();
    for (const r of batch.records) {
      const a = rows.find((a) => a.personality_id === r.id);
      assert(a && a.details === r.changes.lgbti_details, `Unverified explanation: ${r.name}`);
      if (r.changes.lgbti_connection)
        assert(
          a.connection === r.changes.lgbti_connection,
          `Unverified connection category: ${r.name}`,
        );
      for (const s of r.sources.filter((s) =>
        s.fields.some((f) => ['lgbti_details', 'lgbti_connection'].includes(f)),
      ))
        assert(
          a.sources.some((x) => x.url === s.url),
          `Missing public source: ${r.name}`,
        );
      for (const [f, v] of Object.entries(r.translations[lang] || {}))
        assert(a.translations[f] === v, `Translation mismatch: ${r.name} ${lang}.${f}`);
    }
  }
  return { ...summary, passed: true, checked_at: new Date().toISOString(), reader: 'anonymous' };
}
export function releaseReceipt(batch, prepared, verified, deployment, buildId, previous) {
  const summary = validateBatch(batch);
  assert(
    prepared.digest === summary.digest &&
      verified.digest === summary.digest &&
      verified.passed === true &&
      verified.profiles === summary.profiles,
    'Prepared/public verification digest mismatch',
  );
  assert(
    deployment.conclusion === 'success' &&
      deployment.name === 'Deploy to Cloudflare Pages' &&
      /^[0-9a-f]{40}$/.test(deployment.headSha),
    'Successful Pages deployment required',
  );
  assert(buildId.trim() === deployment.headSha, 'Live build does not match deployment commit');
  assert(
    !previous ||
      (previous.digest === summary.digest && previous.deployment_run === deployment.databaseId),
    'Batch already has another deployment receipt',
  );
  return {
    ...summary,
    deployment_run: deployment.databaseId,
    commit: deployment.headSha,
    live_build: buildId.trim(),
    released_at: previous?.released_at || new Date().toISOString(),
  };
}

async function main() {
  const [command, file, out, run] = process.argv.slice(2);
  assert(
    file,
    'Usage: ... validate|prepare|verify|receipt manifest.json [artifact-directory] [deployment-run-id]',
  );
  if (command === 'queue') {
    assert(out && !existsSync(out), 'Provide a new draft manifest path');
    const batch = await queueBatch(
      JSON.parse(readFileSync(file, 'utf8')),
      basename(out, '.json'),
      run ? Number(run) : 20,
    );
    writeFileSync(out, JSON.stringify(batch, null, 2) + '\n', { flag: 'wx' });
    return console.log(
      JSON.stringify(
        { id: batch.id, candidates: batch.records.length, status: 'draft', output: out },
        null,
        2,
      ),
    );
  }
  const batch = JSON.parse(readFileSync(file, 'utf8'));
  validateBatch(batch);
  assert(basename(file, '.json') === batch.id, 'Manifest filename must match batch id');
  if (command === 'validate') return console.log(JSON.stringify(validateBatch(batch), null, 2));
  assert(out, 'Provide the canonical batch artifact directory');
  const dir = resolve(out, batch.id);
  if (command === 'prepare') return console.log(JSON.stringify(prepareBatch(batch, dir), null, 2));
  const prepared = JSON.parse(readFileSync(join(dir, 'prepared.json'), 'utf8'));
  assert(prepared.digest === batchDigest(batch), 'Frozen manifest changed');
  for (const name of ['apply', 'rollback'])
    assert(
      digest(readFileSync(join(dir, `${name}.sql`), 'utf8')) === prepared[`${name}_sha256`],
      `Frozen ${name} SQL changed`,
    );
  if (command === 'verify') {
    const report = await verifyBatch(batch);
    writeFileSync(join(dir, 'verified.json'), JSON.stringify(report, null, 2) + '\n');
    return console.log(JSON.stringify(report, null, 2));
  }
  assert(command === 'receipt' && /^\d+$/.test(run), 'Provide a numeric Pages deployment run id');
  const deployment = JSON.parse(
    execFileSync(
      'gh',
      [
        'run',
        'view',
        run,
        '--repo',
        'tmaeder/queer-guide-hub',
        '--json',
        'name,conclusion,headSha,databaseId',
      ],
      { encoding: 'utf8' },
    ),
  );
  const committed = JSON.parse(
    Buffer.from(
      execFileSync(
        'gh',
        [
          'api',
          `repos/tmaeder/queer-guide-hub/contents/docs/editorial/personality-batches/${batch.id}.json?ref=${deployment.headSha}`,
          '--jq',
          '.content',
        ],
        { encoding: 'utf8' },
      ),
      'base64',
    ).toString('utf8'),
  );
  assert(
    batchDigest(committed) === batchDigest(batch),
    'Deployed commit does not contain the reviewed batch',
  );
  const response = await fetch(
    `https://queer.guide/build-id.txt?batch=${encodeURIComponent(batch.id)}-${Date.now()}`,
  );
  assert(response.ok, 'Live build read failed');
  const receiptPath = join(dir, 'release.json');
  const previous = existsSync(receiptPath)
    ? JSON.parse(readFileSync(receiptPath, 'utf8'))
    : undefined;
  const receipt = releaseReceipt(
    batch,
    prepared,
    JSON.parse(readFileSync(join(dir, 'verified.json'), 'utf8')),
    deployment,
    await response.text(),
    previous,
  );
  if (!previous)
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt, null, 2));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
