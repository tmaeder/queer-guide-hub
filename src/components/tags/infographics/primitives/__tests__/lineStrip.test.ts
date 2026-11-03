import { describe, it, expect } from 'vitest';
import { nextPicks, type StripLine } from '../lineStripModel';
import { LINES } from '../../figures/fourLines/data';

const line = (id: string): StripLine => LINES.find((l) => l.id === id)!;

describe('LineStrip selection rules', () => {
  it('a pick-one line holds exactly one stop', () => {
    const l = line('assigned');
    let p = nextPicks({}, l, 'female');
    p = nextPicks(p, l, 'intersex');
    expect(p.assigned).toEqual(['intersex']);
  });

  it('a pick-any line holds several stops at once — no tradeoff between them', () => {
    const l = line('identity');
    let p = nextPicks({}, l, 'woman');
    p = nextPicks(p, l, 'non-binary');
    expect(p.identity).toEqual(['woman', 'non-binary']);
  });

  it('picking a picked stop on a pick-any line removes it', () => {
    const l = line('identity');
    const p = nextPicks(nextPicks({}, l, 'man'), l, 'man');
    expect(p.identity).toEqual([]);
  });

  it('an exclusive stop clears the others, and is cleared by them', () => {
    const l = line('attraction');
    let p = nextPicks({}, l, 'women');
    p = nextPicks(p, l, 'men');
    p = nextPicks(p, l, 'no-one');
    expect(p.attraction).toEqual(['no-one']);
    p = nextPicks(p, l, 'women');
    expect(p.attraction).toEqual(['women']);
  });

  it('lines never affect each other', () => {
    let p = nextPicks({}, line('identity'), 'woman');
    p = nextPicks(p, line('attraction'), 'women');
    expect(p.identity).toEqual(['woman']);
    expect(p.attraction).toEqual(['women']);
  });

  it('every line offers an explicit "rather not say" stop, and nothing is pre-picked', () => {
    for (const l of LINES) {
      expect(l.stops.some((s) => s.id === 'rather-not' && s.exclusive)).toBe(true);
    }
  });

  it('never links an expression stop to a glossary term', () => {
    // Presenting feminine is not being transfeminine.
    for (const s of line('expression').stops) expect(s.slug).toBeUndefined();
  });
});
