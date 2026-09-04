import { describe, it, expect } from 'vitest';
import {
  decodeHtmlEntities,
  stripHtmlTags,
  cleanAuthor,
  cleanExcerpt,
  cleanContent,
  cleanTitle,
  boundArticleBody,
  ARTICLE_BODY_MAX_CHARS,
} from '../htmlDecode';

describe('decodeHtmlEntities', () => {
  it('should decode &amp; to &', () => {
    expect(decodeHtmlEntities('&amp;')).toBe('&');
  });

  it('should decode &lt; and &gt;', () => {
    expect(decodeHtmlEntities('&lt;div&gt;')).toBe('<div>');
  });

  it('should decode &quot;', () => {
    expect(decodeHtmlEntities('&quot;hello&quot;')).toBe('"hello"');
  });

  it('should return empty string for falsy input', () => {
    expect(decodeHtmlEntities('')).toBe('');
    expect(decodeHtmlEntities(null as unknown as string)).toBe('');
  });

  it('should pass through plain text unchanged', () => {
    expect(decodeHtmlEntities('hello world')).toBe('hello world');
  });
});

describe('stripHtmlTags', () => {
  it('should strip simple tags', () => {
    expect(stripHtmlTags('<p>hello</p>')).toBe('hello');
  });

  it('should strip nested tags', () => {
    expect(stripHtmlTags('<div><b>bold</b> text</div>')).toBe('bold text');
  });

  it('should strip tags with attributes', () => {
    expect(stripHtmlTags('<a href="http://example.com">link</a>')).toBe('link');
  });

  it('should return empty string for falsy input', () => {
    expect(stripHtmlTags('')).toBe('');
    expect(stripHtmlTags(null as unknown as string)).toBe('');
  });
});

describe('cleanAuthor', () => {
  it('should strip HTML tags from author', () => {
    expect(cleanAuthor('<b>John Doe</b>')).toBe('John Doe');
  });

  it('should remove Reddit /u/ prefix', () => {
    expect(cleanAuthor('/u/NamelessResearcher')).toBe('NamelessResearcher');
  });

  it('should remove appended profile URLs', () => {
    expect(cleanAuthor('/u/Userhttps://www.reddit.com/user/User')).toBe('User');
  });

  it('should return empty for falsy input', () => {
    expect(cleanAuthor('')).toBe('');
    expect(cleanAuthor(null as unknown as string)).toBe('');
  });

  it('should return empty for too-short results', () => {
    expect(cleanAuthor('X')).toBe('');
  });

  // D6 — ingestion stored some authors as JSON-encoded arrays. Make sure the
  // brackets and quotes are stripped before the byline renders.
  it('parses single-element JSON array authors', () => {
    expect(cleanAuthor('["ruthless podcast staff"]')).toBe('ruthless podcast staff');
  });

  it('joins multi-element JSON array authors', () => {
    expect(cleanAuthor('["Alex Doe", "Jane Smith"]')).toBe('Alex Doe, Jane Smith');
  });

  it('returns empty for empty JSON array author', () => {
    expect(cleanAuthor('[]')).toBe('');
  });

  it('falls back to original string when not valid JSON', () => {
    expect(cleanAuthor('[author with brackets')).toBe('[author with brackets');
  });

  it('decodes entities in the byline', () => {
    expect(cleanAuthor('Jane &amp; John')).toBe('Jane & John');
    expect(cleanAuthor('O&#039;Brien')).toBe("O'Brien");
  });
});

describe('cleanTitle', () => {
  it('decodes WordPress decimal entities', () => {
    expect(cleanTitle('Kristi Noem &#038; the biggest read')).toBe(
      'Kristi Noem & the biggest read',
    );
    expect(cleanTitle('Bill Newton&#8217;s murder')).toBe('Bill Newton’s murder');
  });

  it('strips encoded tags instead of rendering them literally', () => {
    expect(cleanTitle('A &lt;p&gt;headline&lt;/p&gt;')).toBe('A headline');
  });

  it('strips raw tags', () => {
    expect(cleanTitle('A <b>bold</b> headline')).toBe('A bold headline');
  });

  it('collapses whitespace and trims', () => {
    expect(cleanTitle('  spaced   out  ')).toBe('spaced out');
  });

  it('returns empty for falsy input', () => {
    expect(cleanTitle('')).toBe('');
    expect(cleanTitle(null as unknown as string)).toBe('');
  });
});

describe('cleanExcerpt', () => {
  it('should decode entities and strip tags', () => {
    expect(cleanExcerpt('&lt;p&gt;Hello&lt;/p&gt;')).toBe('Hello');
  });

  it('should remove URLs', () => {
    expect(cleanExcerpt('Check https://example.com for more')).toBe('Check for more');
  });

  it('should remove trailing RSS junk', () => {
    const input = 'Article text. The post My Title appeared first on My Site.';
    expect(cleanExcerpt(input)).toBe('Article text.');
  });

  it('should collapse whitespace', () => {
    expect(cleanExcerpt('hello   \n\n   world')).toBe('hello world');
  });

  it('should return empty for falsy input', () => {
    expect(cleanExcerpt('')).toBe('');
  });
});

describe('cleanContent', () => {
  it('should decode double-encoded entities', () => {
    expect(cleanContent('&amp;amp;')).toBe('&');
  });

  it('should replace non-breaking spaces', () => {
    expect(cleanContent('hello\u00A0world')).toBe('hello world');
  });

  it('should collapse 3+ newlines to 2', () => {
    const result = cleanContent('para1\n\n\n\npara2');
    expect(result).toBe('para1\n\npara2');
  });

  it('should trim each line', () => {
    const result = cleanContent('  line1  \n  line2  ');
    expect(result).toBe('line1\nline2');
  });

  it('should remove WordPress RSS trailing junk', () => {
    const input = 'Content here.\nThe post My Post appeared first on MySite.';
    expect(cleanContent(input)).toBe('Content here.');
  });

  it('should remove Continue reading junk', () => {
    const input = 'Some content… Continue reading Full Article →';
    expect(cleanContent(input)).toBe('Some content');
  });

  it('should remove Subscribe to newsletter junk', () => {
    const input = 'Article text.\nSubscribe to the Daily newsletter for updates';
    expect(cleanContent(input)).toBe('Article text.');
  });

  it('should remove trailing Related section', () => {
    const input = 'Main content.\n\nRelated';
    expect(cleanContent(input)).toBe('Main content.');
  });

  it('should return empty for falsy input', () => {
    expect(cleanContent('')).toBe('');
  });
});

describe('boundArticleBody', () => {
  // Regression guard for the 2026-09-02 finding: NewsDetail rendered
  // news_articles.content in full, which measured as a complete verbatim copy
  // of the third-party article (median stored/live length ratio 1.02).
  const long = (n: number) => 'word '.repeat(Math.ceil(n / 5)).slice(0, n);

  it('returns short bodies untouched and not truncated', () => {
    const short = 'A complete short update.';
    expect(boundArticleBody(short)).toEqual({ text: short, truncated: false });
  });

  it('bounds a full-length article body to the cap', () => {
    const body = long(6000);
    const { text, truncated } = boundArticleBody(body);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(ARTICLE_BODY_MAX_CHARS + 1);
  });

  it('never renders the end of a long article', () => {
    // The decisive property: an excerpt must not contain the source article's
    // closing paragraph. This is what distinguishes quoting from republishing.
    const ending = 'This is the final paragraph of the original report.';
    const { text } = boundArticleBody(`${long(5000)}\n\n${ending}`);
    expect(text).not.toContain(ending);
  });

  it('cuts on a paragraph break when one is available', () => {
    const body = `${long(900)}\n\n${long(900)}`;
    const { text } = boundArticleBody(body);
    expect(text).not.toContain('\n\n');
  });

  it('cuts on a sentence boundary when no paragraph break fits', () => {
    const body = `${long(700)}. ${long(900)}`;
    const { text, truncated } = boundArticleBody(body);
    expect(truncated).toBe(true);
    expect(text.endsWith('.')).toBe(true);
  });

  it('never cuts mid-word', () => {
    const body = 'x'.repeat(400) + ' ' + 'y'.repeat(4000);
    const { text } = boundArticleBody(body);
    // Trailing ellipsis aside, the excerpt ends on a whole token.
    expect(text.replace(/…$/, '')).not.toMatch(/y{2,}$/);
  });

  it('respects an explicit cap', () => {
    const { text } = boundArticleBody(long(3000), 200);
    expect(text.length).toBeLessThanOrEqual(201);
  });

  it('handles empty input', () => {
    expect(boundArticleBody('')).toEqual({ text: '', truncated: false });
  });
});
