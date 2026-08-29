import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * drgay.ch (Aids-Hilfe Schweiz / Swiss AIDS Federation) carries NO open licence.
 * Its Impressum names the publisher and states no terms at all, so the default
 * applies: all rights reserved. queer.guide is commercial — marketplace,
 * affiliate partners, Stripe checkout — so their prose may not be copied, and
 * "adapted" or "paraphrased" is still copied.
 *
 * So the vocabulary signal (which topics exist, what they are called, where they
 * sit) may be stored and their prose may not, in any form. That is the same rule
 * the Kinktionary import runs under, and it erodes the same way: the natural
 * "improvement" to the artifact is to keep the page's text next to its label so
 * the migrations can be written faster.
 *
 * The specific trap on THIS site is the meta description. Every page carries one
 * to three sentences of their copy in <meta name="description">, which reads like
 * structured metadata and sits one property access away from
 * unified_tags.description. It is prose. These tests make storing it
 * mechanically impossible rather than merely discouraged.
 */

const ROOT = join(__dirname, '..', '..', '..');
const ARTIFACT = join(ROOT, 'scripts', 'data-quality', 'drgay-topic-index.json');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

type Artifact = {
  _license: string;
  _source: string;
  _publisher: string;
  _pages: number;
  _count: number;
  topics: { label: string; section: string; url: string; kind: string }[];
};

const artifact = (): Artifact => JSON.parse(readFileSync(ARTIFACT, 'utf8'));

/** Every key a topic entry is allowed to carry. None of these can hold prose. */
const ALLOWED_TOPIC_KEYS = new Set(['label', 'section', 'url', 'kind']);

/** Keys that would carry page text under any plausible name. */
const FORBIDDEN_KEYS = [
  'description',
  'meta_description',
  'metaDescription',
  'definition',
  'body',
  'text',
  'excerpt',
  'summary',
  'content',
  'intro',
  'lead',
  'first_sentence',
  'prose',
];

describe('drgay.ch artifact carries vocabulary signal only', () => {
  it('records the licence constraint in the file itself', () => {
    const a = artifact();
    expect(a._license).toMatch(/NO open licence/i);
    expect(a._license).toMatch(/NO definitions/i);
    expect(a._license).toMatch(/NO meta descriptions/i);
    expect(a._source).toBe('https://drgay.ch/en/');
    expect(a._publisher).toMatch(/Aids-Hilfe Schweiz/i);
  });

  it('has no key anywhere that could hold page text', () => {
    const raw = readFileSync(ARTIFACT, 'utf8');
    for (const key of FORBIDDEN_KEYS) {
      expect(raw, `artifact must not contain a "${key}" key`).not.toMatch(
        new RegExp(`"${key}"\\s*:`, 'i'),
      );
    }
  });

  it('allows only vocabulary keys on every topic', () => {
    for (const t of artifact().topics) {
      for (const key of Object.keys(t)) {
        expect(ALLOWED_TOPIC_KEYS.has(key), `unexpected key "${key}" on topic "${t.label}"`).toBe(
          true,
        );
      }
    }
  });

  it('keeps every label a label, not a sentence', () => {
    // The three bounds the scraper enforces, re-asserted on the committed
    // artifact so a hand-edit cannot smuggle a sentence past them: 80 chars
    // (the cap the Kinktionary artifact uses), at most 8 words, and no terminal
    // sentence punctuation. "Cathinones (3-MMC, 4-MEC...)" passes; drgay's own
    // heading "What and how much does it actually contain?" does not.
    for (const t of artifact().topics) {
      expect(t.label.length, `label too long to be a label: ${t.label}`).toBeLessThanOrEqual(80);
      expect(
        t.label.split(/\s+/).length,
        `label has too many words: ${t.label}`,
      ).toBeLessThanOrEqual(8);
      expect(t.label, `label ends like a sentence: ${t.label}`).not.toMatch(/[.?!]$/);
    }
  });

  it('only carries drgay.ch English URLs', () => {
    for (const t of artifact().topics) {
      expect(t.url, `unexpected URL: ${t.url}`).toMatch(/^https:\/\/drgay\.ch\/en\//);
    }
  });

  it('matches its own declared count', () => {
    const a = artifact();
    expect(a.topics.length).toBe(a._count);
  });
});

/**
 * These guard migrations DERIVED from the drgay signal — the ones that create or
 * rewrite tag content because the coverage probe found a gap. None exist yet:
 * the repairs shipped so far (20261007163000 wrong-entity wikidata, 20261007163100
 * denorm resync) were FOUND while probing but are driven by prod measurements and
 * carry none of drgay's vocabulary, so naming them `drgay` would attach a licence
 * header to files the licence has nothing to do with.
 *
 * The block is skipped rather than asserted-empty on purpose: a skipped suite is
 * visibly not running in the report, whereas a suite that iterates an empty list
 * passes green while checking nothing — the vacuous-pass trap. It arms itself the
 * moment the first `*drgay*` migration lands.
 */
const drgayMigrations = readdirSync(MIGRATIONS).filter((f) => f.includes('drgay'));

describe.skipIf(drgayMigrations.length === 0)('drgay migrations', () => {
  const files = drgayMigrations;

  it('never cite drgay.ch as a source URL', () => {
    // tag_sources rows feed a confidence term and the public "Elsewhere" rail.
    // Citing drgay.ch would assert their page as our source for prose we wrote
    // ourselves, and publish an unlicensed reference as if it were reusable.
    // Our claims are sourced to WHO / CDC / EACS / UNAIDS, which is where they
    // actually come from.
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      const inserts = sql.match(/insert\s+into\s+public\.tag_sources[\s\S]*?;/gi) ?? [];
      for (const stmt of inserts) {
        expect(stmt, `${f} cites drgay.ch in tag_sources`).not.toMatch(/drgay\.ch/i);
      }
    }
  });

  it('carry the licence rationale in their header', () => {
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      expect(sql, `${f} must state the licence constraint`).toMatch(/no open licence/i);
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
    // writing name across a batch silently relocates rows to new slugs
    // (measured in 20260910171943: 'Pride Flag' -> 'Rainbow Pride Flag').
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      const updates = sql.match(/update\s+public\.unified_tags\s+set[\s\S]*?where/gi) ?? [];
      for (const stmt of updates) {
        expect(stmt, `${f} writes unified_tags.name`).not.toMatch(/\bname\s*=/i);
      }
    }
  });

  it('never write the trigger-derived columns', () => {
    // `category` is derived from category_id by sync_tag_category(), and
    // `is_adult` from the Sexuality & Kink subtree by
    // unified_tags_recompute_is_adult(). Writing either by hand produces a value
    // the next junction change silently overwrites.
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      const updates = sql.match(/update\s+public\.unified_tags\s+set[\s\S]*?where/gi) ?? [];
      for (const stmt of updates) {
        expect(stmt, `${f} writes the derived column unified_tags.is_adult`).not.toMatch(
          /\bis_adult\s*=/i,
        );
        expect(stmt, `${f} writes the derived column unified_tags.category`).not.toMatch(
          /\bcategory\s*=/i,
        );
      }
    }
  });
});
