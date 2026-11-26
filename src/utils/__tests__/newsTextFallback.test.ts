import { describe, expect, it } from 'vitest';
import { cleanContent, cleanExcerpt } from '../htmlDecode';

describe('news display fallback', () => {
  it('preserves HTML paragraph boundaries and quotations', () => {
    expect(cleanContent('<p>“Original words.”</p><p>Next paragraph.</p>')).toBe(
      '“Original words.”\n\nNext paragraph.',
    );
  });
  it('cleans double-encoded markup', () => {
    expect(
      cleanContent(
        '&amp;lt;p&amp;gt;First.&amp;lt;/p&amp;gt;&amp;lt;p&amp;gt;Second.&amp;lt;/p&amp;gt;',
      ),
    ).toBe('First.\n\nSecond.');
  });
  it('removes standalone share controls from bodies and excerpts', () => {
    const raw = '<p>Reporting.</p><p>Share on Facebook</p>';
    expect(cleanContent(raw)).toBe('Reporting.');
    expect(cleanExcerpt(raw)).toBe('Reporting.');
  });
  it('preserves clutter phrases used in reporting', () => {
    const raw = 'An advertisement sparked debate. She said, “Subscribe to read the full article.”';
    expect(cleanContent(raw)).toBe(raw);
  });
  it('recovers paragraph spacing only from an exactly matching excerpt', () => {
    expect(
      cleanContent(
        'First paragraph. Second paragraph continues.',
        'First paragraph.\n\nSecond paragraph cont',
      ),
    ).toBe('First paragraph.\n\nSecond paragraph continues.');
    expect(cleanContent('Original words.', 'Different\n\nwords.')).toBe('Original words.');
  });
  it('does not cut reporting at a post-office mention before an RSS footer', () => {
    const body =
      'He finishes work at the post office. ' + 'Original reporting continues. '.repeat(40);
    expect(cleanContent(body + 'The post Headline appeared first on Publisher.')).toBe(body.trim());
  });
});
