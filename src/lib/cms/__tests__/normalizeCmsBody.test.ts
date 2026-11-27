import type { RouteStation } from '@/components/transit/RouteStrip';
import { describe, it, expect } from 'vitest';
import { normalizeCmsBody } from '../normalizeCmsBody';
import { progressiveStations } from '../progressiveStations';

const tags = (html: string) => Array.from(html.matchAll(/<(h[1-6])/g), (m) => m[1]);

describe('normalizeCmsBody', () => {
  // Shape of the live /p/about body (2026-11-27).
  const about =
    '<h1>About The Queer Guide</h1>\n<p>A comprehensive platform connecting people.</p>\n' +
    '<h2>Our Mission</h2><p>x</p><h2>Get Involved</h2><p>y</p>';

  it('drops the authored title heading and the repeated subtitle', () => {
    const out = normalizeCmsBody(about, { subtitle: 'A comprehensive platform connecting people' });
    expect(out).not.toContain('<h1');
    expect(out).not.toContain('comprehensive platform');
    expect(tags(out)).toEqual(['h2', 'h2']);
  });

  it('keeps an intro paragraph that is not the subtitle', () => {
    const out = normalizeCmsBody(
      "<h1>The Legal Stuff</h1><p>Transparency matters. Here's everything.</p>",
      {
        subtitle: 'All legal information, policies, and terms in one place',
      },
    );
    expect(out).toContain('Transparency matters');
  });

  it('demotes later h1s and closes skipped levels', () => {
    const out = normalizeCmsBody('<h2>A</h2><h4>B</h4><h1>C</h1><h5>D</h5><h3>E</h3>');
    expect(tags(out)).toEqual(['h2', 'h3', 'h2', 'h3', 'h3']);
  });

  it('keeps ids and attributes so deep links still land', () => {
    const out = normalizeCmsBody('<h2>A</h2><h4 id="your-rights" class="x">Your rights</h4>');
    expect(out).toContain('<h3 id="your-rights" class="x">Your rights</h3>');
  });

  it('leaves a body without a leading title alone apart from levels', () => {
    const help = '<p><strong>In acute danger, call 112.</strong></p>';
    expect(normalizeCmsBody(help, { subtitle: 'You are not alone.' })).toBe(help);
    expect(normalizeCmsBody('')).toBe('');
  });

  it('does not run anything while parsing', () => {
    let ran = false;
    (window as unknown as { __ran: () => void }).__ran = () => {
      ran = true;
    };
    normalizeCmsBody('<img src="x" onerror="window.__ran()"><h2>A</h2>');
    expect(ran).toBe(false);
  });
});

describe('progressiveStations', () => {
  const s: RouteStation[] = [
    { id: 'a', title: 'A', depth: 1 },
    { id: 'a1', title: 'A1', depth: 2 },
    { id: 'b', title: 'B', depth: 1 },
    { id: 'b1', title: 'B1', depth: 2 },
    { id: 'b2', title: 'B2', depth: 2 },
  ];

  it('shows top-level sections only when nothing is active', () => {
    expect(progressiveStations(s, null).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('opens the children of the active section', () => {
    expect(progressiveStations(s, 'b').map((x) => x.id)).toEqual(['a', 'b', 'b1', 'b2']);
  });

  it('keeps the parent open when a sub-section is active', () => {
    expect(progressiveStations(s, 'a1').map((x) => x.id)).toEqual(['a', 'a1', 'b']);
  });
});
