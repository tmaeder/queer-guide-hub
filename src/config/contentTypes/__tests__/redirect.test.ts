import { describe, expect, it, vi } from 'vitest';
import { redirectContentType } from '../redirect';
import { contentTypeRegistry } from '../index';

vi.mock('@/components/admin/redirects/RedirectEventsPanel', () => ({
  RedirectEventsPanel: () => null,
}));
vi.mock('@/components/admin/redirects/RedirectToolbarActions', () => ({
  RedirectToolbarActions: () => null,
}));

/**
 * Redirects moved off the standalone AdminRedirects page onto the registry.
 * These pin the behaviour that page had, so a conversion cannot quietly drop it.
 */

const validate = redirectContentType.validate!;
const field = (name: string) => redirectContentType.fields.find((f) => f.name === name)!;

describe('redirects registry entry', () => {
  it('is registered under the table name', () => {
    expect(contentTypeRegistry.redirects).toBeDefined();
    expect(redirectContentType.id).toBe('redirects');
    expect(redirectContentType.tableName).toBe('redirects');
  });

  it('selects every column its list columns render', () => {
    const selected = new Set((redirectContentType.listSelect ?? '').split(',').map((s) => s.trim()));
    for (const f of redirectContentType.fields.filter((x) => x.listColumn)) {
      expect(selected.has(f.name), `${f.name} is a list column but not selected`).toBe(true);
    }
  });
});

describe('conditional fields for the two redirect shapes', () => {
  it('shows slug only for SHORT', () => {
    expect(field('slug').visibleWhen!({ type: 'SHORT' })).toBe(true);
    expect(field('slug').visibleWhen!({ type: 'PATH' })).toBe(false);
  });

  it('shows source_path and match_kind only for PATH', () => {
    expect(field('source_path').visibleWhen!({ type: 'PATH' })).toBe(true);
    expect(field('source_path').visibleWhen!({ type: 'SHORT' })).toBe(false);
    expect(field('match_kind').visibleWhen!({ type: 'PATH' })).toBe(true);
  });

  it('shows query_override only when the mode is OVERRIDE', () => {
    expect(field('query_override').visibleWhen!({ query_mode: 'OVERRIDE' })).toBe(true);
    expect(field('query_override').visibleWhen!({ query_mode: 'PRESERVE' })).toBe(false);
  });
});

describe('validation ported from the page', () => {
  it('accepts a well-formed SHORT redirect', () => {
    expect(validate({ type: 'SHORT', slug: 'promo', target: '/venues' }).isValid).toBe(true);
  });

  it('rejects a bad slug on SHORT', () => {
    const r = validate({ type: 'SHORT', slug: 'ab', target: '/venues' });
    expect(r.isValid).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('slug');
  });

  it('does not demand a slug for PATH', () => {
    // The shape that would be unsavable if visibleWhen did not exempt required.
    const r = validate({ type: 'PATH', source_path: '/old', target: '/new' });
    expect(r.errors.map((e) => e.field)).not.toContain('slug');
    expect(r.isValid).toBe(true);
  });

  it('catches a redirect that points at itself', () => {
    // The check worth keeping: a loop takes the URL down for everyone.
    const r = validate({ type: 'SHORT', slug: 'abc', target: '/go/abc' });
    expect(r.isValid).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('target');
  });

  it('returns errors shaped like ValidationResult', () => {
    const r = validate({ type: 'SHORT', slug: 'ab', target: '/go/ab' });
    expect(Array.isArray(r.warnings)).toBe(true);
    for (const e of r.errors) expect(e.severity).toBe('error');
  });
});

describe('tooling carried over from the page', () => {
  it('keeps copy + test row actions, scoped to SHORT links', () => {
    const ids = (redirectContentType.rowActions ?? []).map((a) => a.id);
    expect(ids).toEqual(['copy', 'test']);
    for (const a of redirectContentType.rowActions ?? []) {
      expect(a.visible!({ type: 'SHORT', slug: 'x' })).toBe(true);
      // A PATH redirect has no /go/<slug>, so neither action applies.
      expect(a.visible!({ type: 'PATH', source_path: '/old' })).toBe(false);
      expect(a.visible!({ type: 'SHORT' })).toBe(false);
    }
  });

  it('keeps the collection tools and the per-record analytics panel', () => {
    expect(redirectContentType.toolbarActions).toBeTypeOf('function');
    expect((redirectContentType.extraPanels ?? []).map((p) => p.id)).toContain('events');
  });
});
