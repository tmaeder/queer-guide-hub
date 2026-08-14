import { describe, it, expect } from 'vitest';
import { extractSections, slugify } from '../htmlSections';

describe('extractSections', () => {
  it('indexes h2 as stations and h3 as sub-stations', () => {
    const { sections } = extractSections('<h2>History</h2><p>x</p><h3>Origins</h3>');
    expect(sections).toEqual([
      { id: 'history', title: 'History', depth: 1 },
      { id: 'origins', title: 'Origins', depth: 2 },
    ]);
  });

  it('gives ids derived from the text, not the position', () => {
    // The tag page's old local version numbered ids `section-0`, `section-1`, …
    // so INSERTING a heading silently retargeted every deep link below it.
    const before = extractSections('<h2>Alpha</h2><h2>Beta</h2>');
    const after = extractSections('<h2>New</h2><h2>Alpha</h2><h2>Beta</h2>');
    const idOf = (r: ReturnType<typeof extractSections>, title: string) =>
      r.sections.find((s) => s.title === title)?.id;
    expect(idOf(before, 'Beta')).toBe(idOf(after, 'Beta'));
  });

  it('finds a heading that spans a newline', () => {
    // The regex it replaces (`/<(h[23])[^>]*>(.*?)<\/\1>/gi`) had no `s` flag,
    // so `.` never matched the newline and the heading was skipped entirely.
    const { sections } = extractSections('<h2>\n  Safer\n  sex\n</h2>');
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Safer\n  sex');
  });

  it('de-duplicates ids when two sections share a title', () => {
    const { sections } = extractSections('<h2>Contact</h2><h2>Contact</h2><h2>Contact</h2>');
    expect(sections.map((s) => s.id)).toEqual(['contact', 'contact-2', 'contact-3']);
  });

  it('honours an id the author already set', () => {
    const { sections } = extractSections('<h2 id="your-rights">Rights</h2>');
    expect(sections[0].id).toBe('your-rights');
  });

  it('strips a hand-typed section number from the title', () => {
    const { sections } = extractSections('<h2>1. Overview</h2>');
    expect(sections[0]).toMatchObject({ id: 'overview', title: 'Overview' });
  });

  it('writes the ids into the returned html', () => {
    // Rendering the ORIGINAL html would leave every station anchor pointing at
    // nothing — the ids exist only because this function added them.
    const { htmlWithIds } = extractSections('<h2>History</h2>');
    expect(htmlWithIds).toContain('id="history"');
  });

  it('skips empty headings rather than emitting a blank station', () => {
    const { sections } = extractSections('<h2></h2><h2>Real</h2>');
    expect(sections.map((s) => s.title)).toEqual(['Real']);
  });

  it('ignores h1 and h4 — only h2/h3 are stations', () => {
    const { sections } = extractSections('<h1>Doc</h1><h2>A</h2><h4>Deep</h4>');
    expect(sections.map((s) => s.title)).toEqual(['A']);
  });

  it('returns nothing for html with no headings', () => {
    expect(extractSections('<p>just prose</p>').sections).toEqual([]);
  });
});

describe('slugify', () => {
  it('lowercases and collapses non-alphanumerics to single dashes', () => {
    expect(slugify('Safer Sex & Consent')).toBe('safer-sex-consent');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  — Rights —  ')).toBe('rights');
  });

  it('returns empty for text with nothing sluggable', () => {
    expect(slugify('!!!')).toBe('');
  });
});
