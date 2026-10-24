import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The extract worker cannot import from supabase/functions, so it carries a
// copy of the charset decoder. A copy that drifts back to a forced UTF-8
// decode silently re-introduces U+FFFD in every Latin-1 article body.
const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const body = (s: string) => s.slice(s.indexOf('const SNIFF_BYTES'));

describe('charset decoder', () => {
  it('worker copy matches the edge-function source below the header', () => {
    expect(body(read('workers/extract/src/decodeCharset.ts'))).toBe(
      body(read('supabase/functions/_shared/decode-charset.ts')),
    );
  });

  it.each([
    'supabase/functions/source-rss-news/index.ts',
    'supabase/functions/news-fulltext-backfill/index.ts',
    'supabase/functions/pipeline-extract-fulltext/index.ts',
    'workers/extract/src/index.ts',
  ])('%s decodes fetched bytes through decodeBytes, never a forced UTF-8 decoder', (p) => {
    const src = read(p);
    expect(src).toMatch(/decodeBytes\(/);
    expect(src).not.toMatch(/new TextDecoder\(\s*['"]utf-8['"]\s*\)\.decode/);
  });
});
