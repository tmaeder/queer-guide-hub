import { describe, it, expect } from 'vitest';
import {
  validateKnowledgePatch,
  independentSources,
  normalizeEvaluation,
} from '../../../../supabase/functions/_shared/knowledge-editorial-policy';
import { PILOT_FIGURES } from '../pilotFigures';

describe('knowledge publishing policy', () => {
  it('rejects identity and publication-state mutations', () => {
    expect(
      validateKnowledgePatch('personalities', {
        description: 'Summary',
        bio: 'Body',
        pronouns: 'they/them',
      }),
    ).toContain('unsupported_field');
    expect(
      validateKnowledgePatch('unified_tags', { description: 'Summary', visibility: 'public' }),
    ).toContain('unsupported_field');
  });
  it.each([
    '<script>alert(1)</script>',
    '<p onclick="go()">text</p>',
    '<img src=x>',
    '<a href="https://example.com">unreviewed link</a>',
  ])('rejects unsafe or unreviewed markup: %s', (body) => {
    expect(
      validateKnowledgePatch('unified_tags', { description: 'Summary', long_description: body }),
    ).toContain('unsafe_markup');
  });
  it('rejects escaped prose and administrative wording', () => {
    expect(
      validateKnowledgePatch('personalities', { description: 'Summary', bio: 'First\\nSecond' }),
    ).toContain('escaped_text');
    expect(
      validateKnowledgePatch('personalities', {
        description: 'This documents the connection to LGBTQ culture.',
        bio: 'Body',
      }),
    ).toContain('internal_language');
  });
  it('accepts semantic editorial prose', () =>
    expect(
      validateKnowledgePatch('unified_tags', {
        description: 'A precise summary.',
        long_description: '<h2>Everyday use</h2><p>A concrete explanation.</p>',
      }),
    ).toEqual([]));
  it('does not treat two pages from one publisher as independent evidence', () => {
    const source = {
      id: 'a',
      url: 'https://glaad.org/reference/terms/',
      title: 'Terms',
      publisher: 'GLAAD',
      kind: 'authoritative',
      supports: 'Definition',
    };
    expect(
      independentSources([
        source,
        { ...source, id: 'b', url: 'https://glaad.org/reference/trans-terms/' },
      ]),
    ).toBe(false);
    expect(
      independentSources([
        source,
        { ...source, id: 'b', url: 'https://www.nps.gov/', publisher: 'NPS' },
      ]),
    ).toBe(true);
  });
  it('fails closed for missing or malformed model verdicts', () => {
    const output = normalizeEvaluation({
      claims_supported: 'true',
      sensitive_claims: 'false',
      rubric: { clarity: 4.5, specificity: 6, usefulness: 4, nuance: '5', structure: null },
    });
    expect(output.checks.claims_supported).toBe(false);
    expect(output.checks.sensitive_claims).toBe(true);
    expect(output.rubric).toEqual({
      clarity: 0,
      specificity: 0,
      usefulness: 4,
      nuance: 0,
      structure: 0,
    });
  });
  it('has six distinct figures with nonempty equivalent text and supporting sources', () => {
    expect(PILOT_FIGURES).toHaveLength(6);
    expect(new Set(PILOT_FIGURES.map((f) => f.id)).size).toBe(6);
    for (const f of PILOT_FIGURES) {
      expect(f.summary.length).toBeGreaterThan(30);
      expect(f.rows.length).toBeGreaterThan(2);
      expect(f.sources.every((s) => s.supports && s.url.startsWith('https://'))).toBe(true);
    }
  });
});
