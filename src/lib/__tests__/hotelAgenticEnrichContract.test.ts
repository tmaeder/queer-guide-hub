import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('hotel agentic enrichment contract', () => {
  it('exports the grounded extractor imported by the Edge Function', () => {
    const shared = read('supabase/functions/_shared/ai-enrichment.ts');
    const handler = read('supabase/functions/hotel-agentic-enrich/index.ts');

    expect(handler).toContain('researchEnrichHotelFromPage');
    expect(shared).toContain('export async function researchEnrichHotelFromPage');
    expect(shared).toContain('export interface HotelMoatEnrichment');
    expect(shared).toContain('Use ONLY facts stated in the supplied source text');
  });
});
