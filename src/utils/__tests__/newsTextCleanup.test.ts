import { describe, expect, it } from 'vitest';
import {
  cleanupSource,
  preserveSourceWording,
} from '../../../supabase/functions/_shared/news-quality/source-wording';
import type { QualityDecision } from '../../../supabase/functions/_shared/news-quality/schema';
import {
  newsCleanupSafetyIssues,
  cleanNewsBody,
  cleanNewsText,
  newsTextIssues,
} from '../../../supabase/functions/_shared/news-quality/text-cleanup';
import { sanitizeArticle } from '../../../supabase/functions/_shared/news-quality/sanitize';
import { cleanContent, cleanExcerpt } from '../htmlDecode';

describe('wording-preserving news cleanup', () => {
  const cases: Array<[string, string]> = [
    [
      '<p>First <strong>bold</strong> paragraph.</p><p>Second paragraph.</p>',
      'First bold paragraph.\n\nSecond paragraph.',
    ],
    [
      '&amp;lt;p&amp;gt;“Original quotation.”&amp;lt;/p&amp;gt;&amp;lt;p&amp;gt;Next.&amp;lt;/p&amp;gt;',
      '“Original quotation.”\n\nNext.',
    ],
    [
      'One.<br>Two.<ul><li>First item</li><li>Second item</li></ul>',
      'One.\nTwo.\n\nFirst item\n\nSecond item',
    ],
    [
      '<p>Before.</p><div class="lee-tambien-bbcl"><div>Lee también...</div><a href="/other">Unrelated headline</a></div><p>After.</p>',
      'Before.\n\nAfter.',
    ],
    [
      '<p>Before.</p><style>.widget {color:red}</style><script>track()</script><!-- metadata --><p>After.</p>',
      'Before.\n\nAfter.',
    ],
    [
      '### Heading\n\nA **bold** [label](https://example.org/wiki/Thing_(film)) and *emphasis*.',
      'Heading\n\nA bold label and emphasis.',
    ],
    [
      'Original reporting.\n\nShare this:\nShare on Facebook (Opens in new window) Facebook\nShare on X (Opens in new window) X\nLike this:',
      'Original reporting.',
    ],
    [
      'Original reporting.\n\nSign up for our newsletter\n\nMore reporting.',
      'Original reporting.\n\nMore reporting.',
    ],
    [
      'Support our journalism is their slogan. An advertisement sparked debate. It happened 12 hours ago.',
      'Support our journalism is their slogan. An advertisement sparked debate. It happened 12 hours ago.',
    ],
    [
      'She said, “Subscribe to read the full article.”\nThey called the film “Most Popular”.',
      'She said, “Subscribe to read the full article.”\nThey called the film “Most Popular”.',
    ],
    ['Values are < 5 and > 2. Love <3.', 'Values are < 5 and > 2. Love <3.'],
    ['<a title="one > zero" href="/source">The source</a> agrees.', 'The source agrees.'],
    ['First.\r\n\r\n\r\nSecond.\u00a0 Next.', 'First.\n\nSecond. Next.'],
  ];
  it.each(cases)('cleans %s', (raw, expected) => {
    expect(cleanNewsText(raw)).toBe(expected);
    expect(cleanNewsText(expected)).toBe(expected);
    expect(cleanContent(raw)).toBe(expected);
    expect(sanitizeArticle({ title: 'Article', content: raw }).content).toBe(expected);
  });
  it('removes an observed inline newsletter widget and preserves surrounding reporting', () => {
    expect(
      cleanNewsText(
        'Before. How about we take this to the next level? Subscribe to our newsletter for a refreshing cocktail (or mocktail) of LGBTQ+ entertainment and pop culture, served up with a side of eye-candy. Subscribe to our Newsletter today After.',
      ),
    ).toBe('Before. After.');
  });
  it('never treats a post-office mention as the start of an RSS footer', () => {
    const story =
      'He finishes his shift at the post office. ' + 'Original reporting continues. '.repeat(40);
    expect(cleanNewsText(story + 'The post Example appeared first on Publisher.')).toBe(
      story.trim(),
    );
  });
  it('preserves literal instructions inside reporting', () => {
    expect(cleanNewsText('Readers should Continue reading the law.')).toBe(
      'Readers should Continue reading the law.',
    );
    expect(cleanNewsText('Share on Facebook was the label they criticized.')).toBe(
      'Share on Facebook was the label they criticized.',
    );
  });
  it('keeps title punctuation, wording and casing', () => {
    const title = 'PRIDE WINS — a first for this city | Analysis';
    expect(sanitizeArticle({ title, content: 'Reporting.' }).title).toBe(title);
  });
  it('removes only leading repeated article headings', () => {
    expect(
      cleanNewsText('The title\n\nThe title\n\nReporting.\n\nThe title', { title: 'The title' }),
    ).toBe('Reporting.\n\nThe title');
  });
  it('uses the same clutter cleanup in excerpts', () => {
    expect(cleanExcerpt('<p>Reporting.</p><p>Share on Facebook</p>')).toBe('Reporting.');
    expect(
      sanitizeArticle({
        title: 'Title',
        content: 'Body.',
        excerpt: '<p>Reporting.</p><p>Share on Facebook</p>',
      }).excerpt,
    ).toBe('Reporting.');
  });
  it('flags unrecognized markup for review without deleting the sentence', () => {
    const text = 'Reporting. class="old-widget" More reporting.';
    expect(cleanNewsText(text)).toBe(text);
    expect(newsTextIssues(text)).toContain('markup_residue');
  });
});

describe('cleanup recovery and prevention', () => {
  it('reprocesses an old cleanup without replacing a later human edit', () => {
    expect(cleanupSource('old cleaned', 'original', 'old cleaned')).toBe('original');
    expect(cleanupSource('human edit', 'original', 'old cleaned')).toBe('human edit');
    expect(cleanupSource(null, undefined, undefined)).toBeNull();
  });
  it('uses source wording and paragraphs even when the model rewrites them', () => {
    const decision = {
      title: 'Rewritten',
      cleanedBody: 'Invented.',
      excerpt: 'New claims.',
      isRelevant: true,
      confidence: 0.9,
    } as QualityDecision;
    const kept = preserveSourceWording(decision, {
      title: 'Original — title',
      content: '<p>“Original words.”</p><p>Next paragraph.</p>',
      excerpt: 'Original excerpt.',
    });
    expect(kept.title).toBe('Original — title');
    expect(kept.cleanedBody).toBe('“Original words.”\n\nNext paragraph.');
    expect(kept.excerpt).toBe('Original excerpt.');
    expect(kept.confidence).toBe(0.9);
    expect(kept.isRelevant).toBe(true);
  });
});

describe('recovering source paragraph breaks', () => {
  it('recovers only authoritative whitespace from a matching publisher excerpt', () => {
    const body = 'First paragraph. Second paragraph continues after the excerpt.';
    const result = cleanNewsBody(body, 'First paragraph.\n\nSecond paragraph cont');
    expect(result).toBe('First paragraph.\n\nSecond paragraph continues after the excerpt.');
    expect(result.replace(/\s+/g, ' ')).toBe(body);
  });
  it('does not substitute a differently worded excerpt or change an already formatted body', () => {
    expect(cleanNewsBody('Original words.', 'Different\n\nwords.')).toBe('Original words.');
    expect(cleanNewsBody('One.\n\nTwo.', 'One.\nTwo.')).toBe('One.\n\nTwo.');
  });
});

it('holds unusually destructive cleanup for review', () => {
  expect(newsCleanupSafetyIssues('Original reporting. '.repeat(100), 'A fragment.')).toEqual([
    'excessive_cleanup',
  ]);
  expect(newsCleanupSafetyIssues('Original words.', 'Original words.')).toEqual([]);
});
it('keeps an empty model extraction recognizable as an absent verdict', () => {
  const empty = { title: '', excerpt: '', cleanedBody: '', confidence: 0 } as QualityDecision;
  expect(preserveSourceWording(empty, { title: 'Source title', content: 'Source body.' })).toBe(
    empty,
  );
});
