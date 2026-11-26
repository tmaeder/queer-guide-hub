/** Read-only public-content audit. Never writes to Supabase or infers identity.
 * npx tsx scripts/data-quality/audit-personality-editorial.ts --out /absolute/report.json
 * --rows /absolute/export.json audits a supplied export without network access.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { detectPersonalityLanguage, hasMixedScriptWord } from '../../src/lib/personalityLanguage';
import { assertPublishableKey } from './personality-editorial-batch.mjs';

interface Row {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  bio?: string | null;
  lgbti_connection?: string | null;
  lgbti_details?: string | null;
  wikidata_qid?: string | null;
  birth_date?: string | null;
  editorial?: { details: string | null; connection: string | null } | null;
  localized?: Record<string, Record<string, string>>;
}

const textHash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(value) ?? 'null')
    .digest('hex');
type ApprovedExceptions = Set<string>;
const exceptionKey = (id: string, language: string, field: string, value: string) =>
  `${id}:${language}:${field}:${textHash(value)}`;
interface ReviewedManifest {
  records?: Array<{
    id: string;
    review?: { status?: string; note?: string; language_exceptions?: string[] };
    translations?: Record<string, Record<string, string>>;
  }>;
}
export function reviewedLanguageExceptions(manifests: ReviewedManifest[]): ApprovedExceptions {
  const result = new Set<string>();
  for (const batch of manifests)
    for (const r of batch.records || [])
      for (const key of r.review?.language_exceptions || []) {
        const [language, field] = key.split('.');
        const value = r.translations?.[language]?.[field];
        if (typeof value === 'string' && r.review?.status === 'reviewed' && r.review?.note)
          result.add(exceptionKey(r.id, language, field, value));
      }
  return result;
}

export function auditPersonality(row: Row, exceptions: ApprovedExceptions = new Set()) {
  const issues: string[] = [];
  if (/\bnotable\s+figure\s+in\s+the\s+LGBT(?:Q(?:IA?)?)?\+?\s+community\b/i.test(row.bio || ''))
    issues.push('generic_biography_template');
  if (!row.lgbti_details?.trim()) issues.push('missing_connection_explanation');
  else if (row.lgbti_details.trim().length < 80) issues.push('connection_explanation_too_short');
  const summaryLength = row.description?.trim().length || 0;
  if (summaryLength < 120 || summaryLength > 240) issues.push('summary_length_out_of_range');
  if (!row.lgbti_connection || ['unclear', 'none_known'].includes(row.lgbti_connection)) {
    issues.push('connection_needs_source_review');
  }
  if (row.editorial !== undefined) {
    if (row.editorial === null) issues.push('public_editorial_projection_missing');
    else {
      if (row.lgbti_details?.trim() && row.editorial.details !== row.lgbti_details)
        issues.push('unverified_connection_explanation');
      if (
        row.lgbti_connection &&
        !['unclear', 'none_known'].includes(row.lgbti_connection) &&
        row.editorial.connection !== row.lgbti_connection
      )
        issues.push('unverified_connection_category');
    }
  }
  const languages: Record<string, string[]> = {};
  for (const field of ['description', 'bio', 'lgbti_details'] as const) {
    const value = row[field]?.trim();
    if (!value) continue;
    if (hasMixedScriptWord(value)) issues.push(`${field}_mixed_script_word`);
    // Heuristics flag work for an editor; they do not authorize a rewrite.
    const paragraphs = value.split(/\n+|(?<=[.!?])\s+/).filter((p) => p.length >= 60);
    const detected = [
      ...new Set(paragraphs.map(detectPersonalityLanguage).filter((l): l is string => !!l)),
    ];
    if (detected.length) languages[field] = detected;
    if (detected.length > 1) issues.push(`${field}_possibly_mixed_languages`);
    else if (detected.length === 1 && detected[0] !== 'en')
      issues.push(`${field}_needs_english_base`);
  }
  for (const [language, fields] of Object.entries(row.localized || {}))
    for (const [field, value] of Object.entries(fields)) {
      if (!value || !['description', 'bio', 'lgbti_details'].includes(field)) continue;
      if (hasMixedScriptWord(value)) issues.push(`${language}.${field}_mixed_script_word`);
      const detected = detectPersonalityLanguage(value);
      if (
        detected &&
        detected !== language &&
        !exceptions.has(exceptionKey(row.id, language, field, value))
      )
        issues.push(`${language}.${field}_needs_language_review`);
    }
  const localized = Object.fromEntries(
    Object.entries(row.localized || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([language, fields]) => [
        language,
        Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))),
      ]),
  );
  return {
    id: row.id,
    name: row.name,
    url: `https://queer.guide/personalities/${row.slug || row.id}`,
    issues,
    detected_languages: languages,
    fingerprint: textHash({
      name: row.name,
      slug: row.slug || null,
      qid: row.wikidata_qid || null,
      birth_date: row.birth_date || null,
      description: row.description || null,
      bio: row.bio || null,
      details: row.lgbti_details || null,
      connection: row.lgbti_connection || null,
      verified:
        row.editorial === undefined
          ? null
          : {
              details: row.editorial?.details === row.lgbti_details,
              connection: row.editorial?.connection === row.lgbti_connection,
            },
      localized,
    }),
  };
}

interface Baseline {
  schema_version: 1;
  allowed: Record<string, { fingerprint: string; issues: string[] }>;
}
export function createEditorialBaseline(records: ReturnType<typeof auditPersonality>[]): Baseline {
  return {
    schema_version: 1,
    allowed: Object.fromEntries(
      records
        .filter((r) => r.issues.length)
        .map((r) => [r.id, { fingerprint: r.fingerprint, issues: r.issues }]),
    ),
  };
}
export function editorialRegressions(
  records: ReturnType<typeof auditPersonality>[],
  baseline: Baseline,
) {
  if (baseline.schema_version !== 1 || !baseline.allowed)
    throw new Error('Invalid editorial baseline');
  return records.flatMap((r) => {
    const old = baseline.allowed[r.id];
    const issues = r.issues.filter(
      (issue) => !old || old.fingerprint !== r.fingerprint || !old.issues.includes(issue),
    );
    return issues.length ? [{ id: r.id, issues }] : [];
  });
}
export function assertEditorialBaselineRatchet(previous: Baseline, next: Baseline) {
  if (previous.schema_version !== 1 || next.schema_version !== 1)
    throw new Error('Invalid editorial baseline version');
  for (const [id, value] of Object.entries(next.allowed)) {
    const old = previous.allowed[id];
    if (
      !old ||
      old.fingerprint !== value.fingerprint ||
      value.issues.some((issue) => !old.issues.includes(issue))
    )
      throw new Error(`Editorial baseline may only remove legacy exceptions: ${id}`);
  }
}

/** Retry only database statement timeouts; never turn failed reads into clean data. */
export async function retryPublicRead<
  T extends { error: { code?: string; message: string } | null },
>(read: () => PromiseLike<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const result = await read();
    if (result.error?.code !== '57014' || attempt >= 2) return result;
    await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const option = (key: string) => {
    const index = args.indexOf(key);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const out = option('--out');
  if (!out) throw new Error('Provide --out /absolute/report.json');
  const file = option('--rows');
  let rows: Row[];
  if (file) {
    rows = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    // Use the same public credentials as the website; no service-role access.
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
    if (!url || !key) throw new Error('Public Supabase configuration unavailable');
    assertPublishableKey(key);
    const db = createClient(url, key, { auth: { persistSession: false } });
    rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await retryPublicRead(() =>
        db
          .from('personalities')
          .select(
            'id,name,slug,wikidata_qid,birth_date,description,bio,lgbti_connection,lgbti_details',
          )
          .eq('visibility', 'public')
          .is('duplicate_of_id', null)
          .order('id')
          .range(offset, offset + 499),
      );
      if (error) throw new Error(`Public audit read failed: ${error.message}`);
      rows.push(...data);
      if (data.length < 500) break;
    }
    if (!rows.length) throw new Error('The public catalog audit returned no profiles');
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const row of rows) row.editorial = null;
    const languages =
      args.includes('--all-languages') || option('--baseline')
        ? ['en', 'de', 'fr', 'it', 'es', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar']
        : ['en', 'de'];
    const jobs: Array<{ ids: string[]; language: string }> = [];
    for (let offset = 0; offset < rows.length; offset += 50)
      for (const language of languages)
        jobs.push({ ids: rows.slice(offset, offset + 50).map((row) => row.id), language });
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (cursor < jobs.length) {
          const job = jobs[cursor++];
          const { data, error } = await retryPublicRead(() =>
            db.rpc('personality_public_editorial', {
              p_ids: job.ids,
              p_lang: job.language,
            }),
          );
          if (error) throw new Error(`Public editorial audit failed: ${error.message}`);
          for (const editorial of data || []) {
            const row = byId.get(editorial.personality_id);
            if (!row) continue;
            if (job.language === 'en')
              row.editorial = { details: editorial.details, connection: editorial.connection };
            row.localized ||= {};
            row.localized[job.language] = editorial.translations || {};
          }
        }
      }),
    );
  }
  const manifestDirectory = new URL('../../docs/editorial/personality-batches/', import.meta.url);
  const exceptions = reviewedLanguageExceptions(
    readdirSync(manifestDirectory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => JSON.parse(readFileSync(new URL(name, manifestDirectory), 'utf8'))),
  );
  const records = rows.map((row) => auditPersonality(row, exceptions));
  const counts: Record<string, number> = {};
  for (const row of records)
    for (const issue of row.issues) counts[issue] = (counts[issue] || 0) + 1;
  const baselinePath = option('--baseline');
  const regressions = baselinePath
    ? editorialRegressions(records, JSON.parse(readFileSync(baselinePath, 'utf8')))
    : [];
  writeFileSync(
    out,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total: rows.length,
        counts,
        regressions,
        note: 'Language detection is heuristic. Review sources before changing descriptions or identity claims. Missing evidence does not mean no community connection.',
        records,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify(
      { total: rows.length, counts, regressions: regressions.length, report: out },
      null,
      2,
    ),
  );
  if (regressions.length)
    throw new Error(`New personality editorial issues: ${regressions.length}; see ${out}`);
}

if (process.argv[1]?.endsWith('audit-personality-editorial.ts')) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
