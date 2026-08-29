import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Kinktionary is licensed non-commercial-only
 * (https://fetlife.com/kinktionary/license-zcfzz): "You may not use any material
 * from the Kinktionary for commercial purposes without the express written
 * consent of FetLife." queer.guide is commercial — marketplace, affiliate
 * partners, Stripe checkout — and the NC term binds adaptations and remixes as
 * well as verbatim copies.
 *
 * So the vocabulary signal (term names, sections, relations) may be stored and
 * their prose may not, in any form. That distinction is easy to state and easy
 * to erode: the natural "improvement" to the committed artifact is to add the
 * definition next to the term so the migrations can be written faster. These
 * tests exist to make that mechanically impossible rather than merely
 * discouraged — the same reasoning that made request_id the primary key of
 * admin_automation_run_requests instead of a documented convention.
 */

const ROOT = join(__dirname, '..', '..', '..');
const ARTIFACT = join(ROOT, 'scripts', 'data-quality', 'kinktionary-term-index.json');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

type Artifact = {
  _license: string;
  _source: string;
  _count: number;
  // relatedTerms is only present after a `--related` run; the term list itself
  // is captured without it.
  terms: { term: string; section: string; href: string; relatedTerms?: string[] }[];
};

const artifact = (): Artifact => JSON.parse(readFileSync(ARTIFACT, 'utf8'));

/** Every key any term entry is allowed to carry. Nothing here can hold prose. */
const ALLOWED_TERM_KEYS = new Set(['term', 'section', 'href', 'relatedTerms']);

/** Keys that would carry definition text under any plausible name. */
const FORBIDDEN_KEYS = [
  'definition',
  'description',
  'body',
  'text',
  'excerpt',
  'summary',
  'content',
  'first_sentence',
  'prose',
];

describe('Kinktionary artifact carries vocabulary signal only', () => {
  it('records the licence constraint in the file itself', () => {
    const a = artifact();
    expect(a._license).toMatch(/non-commercial/i);
    expect(a._license).toMatch(/NO definitions/i);
    expect(a._source).toBe('https://fetlife.com/kinktionary');
  });

  it('has no key anywhere that could hold definition text', () => {
    const raw = readFileSync(ARTIFACT, 'utf8');
    for (const key of FORBIDDEN_KEYS) {
      expect(raw, `artifact must not contain a "${key}" key`).not.toMatch(
        new RegExp(`"${key}"\\s*:`, 'i'),
      );
    }
  });

  it('allows only vocabulary keys on every term', () => {
    for (const t of artifact().terms) {
      for (const key of Object.keys(t)) {
        expect(ALLOWED_TERM_KEYS.has(key), `unexpected key "${key}" on term "${t.term}"`).toBe(
          true,
        );
      }
    }
  });

  it('keeps every stored string short enough to be a label, not prose', () => {
    // A term name is a label. 80 characters is generous for the longest real
    // entry ("Consent, Aftercare, Boundaries, Intentions, Negotiation, and
    // Safety (CABINS)" is 74) and far too short to smuggle a definition.
    for (const t of artifact().terms) {
      expect(t.term.length, `term too long to be a label: ${t.term}`).toBeLessThanOrEqual(80);
      for (const r of t.relatedTerms ?? []) {
        expect(r.length, `related term too long to be a label: ${r}`).toBeLessThanOrEqual(80);
      }
    }
  });

  it('matches its own declared count', () => {
    const a = artifact();
    expect(a.terms.length).toBe(a._count);
  });
});

describe('Kinktionary migrations', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.includes('kinktionary'));

  it('exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never cite fetlife.com as a source URL', () => {
    // tag_sources rows feed a confidence term and the public "Elsewhere" rail.
    // Citing FetLife would both assert their prose as our source and publish an
    // NC-licensed reference as if it were reusable.
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      const inserts = sql.match(/insert\s+into\s+public\.tag_sources[\s\S]*?;/gi) ?? [];
      for (const stmt of inserts) {
        expect(stmt, `${f} cites fetlife.com in tag_sources`).not.toMatch(/fetlife\.com/i);
      }
    }
  });

  it('carry the licence rationale in their header', () => {
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      expect(sql, `${f} must state the licence constraint`).toMatch(/non-commercial/i);
      expect(sql, `${f} must state that no prose is copied`).toMatch(
        /NOT ONE WORD OF THEIR PROSE IS COPIED/i,
      );
    }
  });

  it('name an actor before touching unified_tags', () => {
    // log_unified_tag_change() raises on a human_reviewed row when app.actor is
    // unset. 7e65274ff is the commit that learned this the hard way.
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      if (!/update\s+public\.unified_tags/i.test(sql)) continue;
      expect(sql, `${f} must set app.actor`).toMatch(/set_config\(\s*'app\.actor'/);
    }
  });

  it('never write unified_tags.name — the slug is derived from it', () => {
    // normalize_tag_input() re-derives slug whenever an UPDATE changes name, so
    // writing name across a revival batch silently relocates rows to new slugs
    // (measured in 20260910171943: 'Pride Flag' -> 'Rainbow Pride Flag').
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      const updates = sql.match(/update\s+public\.unified_tags\s+set[\s\S]*?where/gi) ?? [];
      for (const stmt of updates) {
        expect(stmt, `${f} writes unified_tags.name`).not.toMatch(/\bname\s*=/i);
      }
    }
  });
});
