import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { programmeLd } from '@/lib/eventProgrammeLd';

const CRAWLER = readFileSync(join(process.cwd(), 'functions/_lib/detail.ts'), 'utf8');

const umbrella = { id: 'u1', slug: 'lila-queer-festival', title: 'lila Queer Festival' };
const child = (over: Partial<{ id: string; slug: string | null; title: string }> = {}) => ({
  id: 'c1',
  slug: 'lila-donnerstag',
  title: 'lila. 26 — Donnerstag',
  start_date: '2026-09-10T18:00:00Z',
  ...over,
});

describe('programmeLd', () => {
  it('declares subEvent on the umbrella', () => {
    const ld = programmeLd('u1', umbrella, [child()]);
    expect(ld.superEvent).toBeUndefined();
    expect(ld.subEvent).toEqual([
      {
        '@type': 'Event',
        name: 'lila. 26 — Donnerstag',
        url: 'https://queer.guide/events/lila-donnerstag',
        startDate: '2026-09-10T18:00:00Z',
      },
    ]);
  });

  it('declares superEvent on a child', () => {
    // Same arguments as above apart from the id the page was opened with —
    // event_programme resolves both sides to the same root, so that id is the only
    // thing distinguishing the two ends.
    const ld = programmeLd('c1', umbrella, [child()]);
    expect(ld.subEvent).toBeUndefined();
    expect(ld.superEvent).toEqual({
      '@type': 'Event',
      name: 'lila Queer Festival',
      url: 'https://queer.guide/events/lila-queer-festival',
    });
  });

  it('says nothing rather than claiming an empty programme', () => {
    // {} not {subEvent: []} — an empty array asserts a festival HAS no programme,
    // which is a different claim from not having one to declare.
    expect(programmeLd('u1', umbrella, [])).toEqual({});
    expect(programmeLd('u1', null, [child()])).toEqual({});
    expect(programmeLd(undefined, umbrella, [child()])).toEqual({});
  });

  it('never lists the umbrella inside its own subEvent', () => {
    const ld = programmeLd('u1', umbrella, [child({ id: 'u1', slug: 'lila-queer-festival' })]);
    expect(ld).toEqual({});
  });

  it('skips a child with no slug rather than emitting a url ending in null', () => {
    const ld = programmeLd('u1', umbrella, [child({ slug: null })]);
    expect(ld).toEqual({});
  });
});

describe('the crawler emitter does not drift from this one', () => {
  // functions/ and src/ share no module graph, so the relation is written twice.
  // These assert the crawler copy keeps the properties that matter; the shapes are
  // small, and a drift test is the arrangement the boot guard already uses.
  it('emits both properties', () => {
    expect(CRAWLER).toMatch(/eventLd\.superEvent\s*=/);
    expect(CRAWLER).toMatch(/eventLd\.subEvent\s*=/);
  });

  it('withholds a safety-gated child from a public document', () => {
    // The gate hides the child's own page; naming its title and url in the parent's
    // JSON-LD would hand a crawler exactly what the gate exists to withhold.
    const childQuery = CRAWLER.slice(CRAWLER.indexOf('parent_event_id=eq.'));
    expect(childQuery.slice(0, 200)).toContain('safety_gated=is.false');
  });

  it('bounds the child lookup', () => {
    // subEvent is a hint, not a sitemap — the day-part pages are in
    // sitemap-events.xml on their own account.
    const call = CRAWLER.slice(CRAWLER.indexOf('parent_event_id=eq.'));
    expect(call.slice(0, 400)).toMatch(/\n\s*25,/);
  });

  it('asks for the parent only when the row has one', () => {
    // A child already knows its parent id from its own row; an umbrella has to look
    // its children up. Doing both on every event page would double the queries on
    // 48k pages to serve 5.
    expect(CRAWLER).toMatch(/if \(parentId\) \{[\s\S]{0,600}?return;\n {2}\}/);
  });

  it('selects the columns the relation needs', () => {
    // parent_event_id and id were in neither the select nor the row before this;
    // without them attachProgrammeLd silently does nothing.
    const select = CRAWLER.slice(CRAWLER.indexOf("'id,parent_event_id,title,slug,description"));
    expect(select.slice(0, 60)).toContain('id,parent_event_id');
  });
});
