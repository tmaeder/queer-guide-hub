import { describe, it, expect } from 'vitest';
import {
  INFOGRAPHICS,
  FIGURES_BY_SLUG,
  MENTIONS_BY_SLUG,
  figuresForSlug,
  mentionsForSlug,
  hasFigure,
  allReferencedSlugs,
} from '../registry';

/**
 * The registry's invariants, and the reverse index derived from it.
 *
 * The source blocklist below is the one that matters most. Every figure here
 * replaces a plate that is copyrighted, watermarked or licensed
 * non-commercially, and a "citation" pointing back at the plate we rebuilt
 * away from would look like diligence while being the opposite. Catching that
 * in review depends on a reviewer recognising a domain; catching it here does
 * not.
 */

/** Origins of the reference plates. Citing one is never correct. */
const BLOCKED_SOURCE_HOSTS = [
  'buzzfeed',
  'scientificamerican',
  'etsy',
  'tumblr',
  'kinkyinkpress',
  'cannoninstitute',
  'tootimid',
  'choosingtherapy',
  'dw.com',
  'itspronouncedmetrosexual',
  'dreamydesire',
  'exgfgallery',
  'sensueletmarquant',
];

describe('infographic registry', () => {
  it('has at least one figure', () => {
    expect(INFOGRAPHICS.length).toBeGreaterThan(0);
  });

  it('gives every figure a unique id', () => {
    const ids = INFOGRAPHICS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(INFOGRAPHICS.map((f) => [f.id, f] as const))(
    '%s: has exactly one subject term',
    (_id, figure) => {
      const subjects = figure.teaches.filter((x) => x.role === 'subject');
      expect(subjects).toHaveLength(1);
    },
  );

  it.each(INFOGRAPHICS.map((f) => [f.id, f] as const))(
    '%s: never lists the same slug twice',
    (_id, figure) => {
      const slugs = figure.teaches.map((x) => x.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    },
  );

  it.each(INFOGRAPHICS.map((f) => [f.id, f] as const))(
    '%s: every slug is slug-shaped and lowercase',
    (_id, figure) => {
      for (const teach of figure.teaches) {
        expect(teach.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      }
    },
  );

  it.each(INFOGRAPHICS.map((f) => [f.id, f] as const))(
    '%s: cites at least one source, and every source says what it supports',
    (_id, figure) => {
      expect(figure.sources.length).toBeGreaterThan(0);
      for (const source of figure.sources) {
        expect(source.supports.trim().length).toBeGreaterThan(0);
        expect(source.publisher.trim().length).toBeGreaterThan(0);
        expect(source.title.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it.each(INFOGRAPHICS.map((f) => [f.id, f] as const))(
    '%s: never cites the plate it replaced',
    (_id, figure) => {
      for (const source of figure.sources) {
        const url = (source.url ?? '').toLowerCase();
        for (const blocked of BLOCKED_SOURCE_HOSTS) {
          expect(url).not.toContain(blocked);
        }
      }
    },
  );

  it.each(INFOGRAPHICS.map((f) => [f.id, f] as const))(
    '%s: carries an ISO checkedOn date',
    (_id, figure) => {
      expect(figure.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(figure.checkedOn).getTime())).toBe(false);
    },
  );

  it.each(INFOGRAPHICS.map((f) => [f.id, f] as const))(
    '%s: a risk-encoding figure never also names a track',
    (_id, figure) => {
      // The type makes this unrepresentable; the runtime assert covers a
      // figure authored in plain JS or cast through `any`.
      if (figure.encodesRisk) {
        expect((figure as { accent?: unknown }).accent).toBeUndefined();
      }
    },
  );

  it.each(INFOGRAPHICS.map((f) => [f.id, f] as const))(
    '%s: emits a rectangular, non-empty data table',
    (_id, figure) => {
      const table = figure.dataTable();
      expect(table.columns.length).toBeGreaterThan(0);
      expect(table.rows.length).toBeGreaterThan(0);
      for (const row of table.rows) {
        expect(row).toHaveLength(table.columns.length);
      }
    },
  );

  it.each(INFOGRAPHICS.map((f) => [f.id, f] as const))(
    '%s: every i18n key is namespaced under tags.figures',
    (_id, figure) => {
      for (const key of [figure.titleKey, figure.captionKey, figure.summaryKey]) {
        expect(key.startsWith('tags.figures.')).toBe(true);
      }
    },
  );
});

describe('reverse index', () => {
  it('files a figure under every term it puts IN the picture', () => {
    for (const figure of INFOGRAPHICS) {
      for (const teach of figure.teaches) {
        if (teach.role === 'mentioned') continue;
        expect(figuresForSlug(teach.slug)).toContain(figure);
      }
    }
  });

  it('never files a merely-mentioned term as a figure host', () => {
    // A term named in a legend has not been taught. Rendering a 400px
    // interactive on its page would misrepresent what the diagram is about.
    for (const figure of INFOGRAPHICS) {
      for (const teach of figure.teaches) {
        if (teach.role !== 'mentioned') continue;
        expect(figuresForSlug(teach.slug)).not.toContain(figure);
        expect(mentionsForSlug(teach.slug)).toContain(figure);
      }
    }
  });

  it('puts the subject figure first on its own term', () => {
    for (const figure of INFOGRAPHICS) {
      const subject = figure.teaches.find((x) => x.role === 'subject');
      expect(subject).toBeDefined();
      expect(figuresForSlug(subject!.slug)[0]).toBe(figure);
    }
  });

  it('agrees with hasFigure', () => {
    for (const slug of FIGURES_BY_SLUG.keys()) {
      expect(hasFigure(slug)).toBe(true);
    }
    expect(hasFigure('a-slug-no-figure-teaches')).toBe(false);
    expect(hasFigure(null)).toBe(false);
    expect(hasFigure(undefined)).toBe(false);
  });

  it('a mention-only slug reports no figure', () => {
    for (const slug of MENTIONS_BY_SLUG.keys()) {
      if (FIGURES_BY_SLUG.has(slug)) continue;
      expect(hasFigure(slug)).toBe(false);
    }
  });

  it('allReferencedSlugs is deduplicated and covers every role', () => {
    const slugs = allReferencedSlugs(INFOGRAPHICS);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const figure of INFOGRAPHICS) {
      for (const teach of figure.teaches) {
        expect(slugs).toContain(teach.slug);
      }
    }
  });
});
