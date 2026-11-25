/** Read-only public-content audit. Never writes to Supabase or infers identity.
 * npx tsx scripts/data-quality/audit-personality-editorial.ts --out /absolute/report.json
 * --rows /absolute/export.json audits a supplied export without network access.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { detectPersonalityLanguage, hasMixedScriptWord } from '../../src/lib/personalityLanguage';

interface Row {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  bio?: string | null;
  lgbti_connection?: string | null;
  lgbti_details?: string | null;
}

export function auditPersonality(row: Row) {
  const issues: string[] = [];
  if (!row.lgbti_details?.trim()) issues.push('missing_connection_explanation');
  if (!row.lgbti_connection || ['unclear', 'none_known'].includes(row.lgbti_connection)) {
    issues.push('connection_needs_source_review');
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
  return {
    id: row.id,
    name: row.name,
    url: `https://queer.guide/personalities/${row.slug || row.id}`,
    issues,
    detected_languages: languages,
  };
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
    const url = process.env.SUPABASE_URL || source.match(/(?:const|export const) SUPABASE_URL[\s\S]*?['"](https:\/\/[^'"]+)['"]/)?.[1];
    const key =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      source.match(/const SUPABASE_PUBLISHABLE_KEY[\s\S]*?['"](eyJ[^'"]+)['"]/)?.[1];
    if (!url || !key) throw new Error('Public Supabase configuration unavailable');
    const db = createClient(url, key, { auth: { persistSession: false } });
    rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db
        .from('personalities')
        .select('id,name,slug,description,bio,lgbti_connection,lgbti_details')
        .eq('visibility', 'public')
        .is('duplicate_of_id', null)
        .order('id')
        .range(offset, offset + 499);
      if (error) throw new Error(`Public audit read failed: ${error.message}`);
      rows.push(...data);
      if (data.length < 500) break;
    }
  }
  const records = rows.map(auditPersonality);
  const counts: Record<string, number> = {};
  for (const row of records)
    for (const issue of row.issues) counts[issue] = (counts[issue] || 0) + 1;
  writeFileSync(
    out,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total: rows.length,
        counts,
        note: 'Language detection is heuristic. Review sources before changing descriptions or identity claims. Missing evidence does not mean no community connection.',
        records,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ total: rows.length, counts, report: out }, null, 2));
}

if (process.argv[1]?.endsWith('audit-personality-editorial.ts')) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
