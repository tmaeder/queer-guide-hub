import { describe, it, expect } from 'vitest';
import {
  decodeHtmlEntities,
  stripHtmlTags,
  cleanAuthor,
  cleanExcerpt,
  cleanContent,
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
