/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  bodyRepeatsDek,
  extractDek,
  isFreshArticle,
  IntegrityNotice,
  newsArticleNoIndex,
} from '../NewsDetail.parts';

describe('newsArticleNoIndex', () => {
  // The edge injects noindex for seo_indexable=false rows, but useMeta strips
  // any robots tag when its noIndex option is falsy — and NewsDetail passed no
  // noIndex at all, so the JS render pass silently un-gated those rows.
  it('noindexes an article explicitly marked non-indexable', () => {
    expect(newsArticleNoIndex(false)).toBe(true);
  });

  it('leaves an explicitly indexable article indexable', () => {
    expect(newsArticleNoIndex(true)).toBe(false);
  });

  // Polarity guard. The edge uses `indexable !== false`, so an unset flag means
  // INDEXABLE. A truthy test here would noindex every row that never had the
  // column written — silently deindexing most of the corpus.
  it('treats null and undefined as indexable, matching the edge', () => {
    expect(newsArticleNoIndex(null)).toBe(false);
    expect(newsArticleNoIndex(undefined)).toBe(false);
  });
});

describe('extractDek', () => {
  it('returns the first sentence when within 180 chars', () => {
    expect(extractDek('Berlin Pride drew a record crowd. More marched than ever before.')).toBe(
      'Berlin Pride drew a record crowd.',
    );
  });

  it('truncates a long sentence with an ellipsis', () => {
    const long = 'a'.repeat(200);
    const dek = extractDek(long);
    expect(dek.length).toBeLessThanOrEqual(181);
    expect(dek.endsWith('…')).toBe(true);
  });

  it('returns empty string for empty input', () => {
    expect(extractDek('')).toBe('');
  });
});

describe('bodyRepeatsDek', () => {
  // Pink News, /news/lgbtq-rights-group-forced-to-relocate-to-brussels-amid-georgia-government-crackdown-9d9779a2
  const body =
    'Tbilisi Pride has moved its operations from Georgia to Brussels, saying a government crackdown has made it too dangerous to keep organising at home.\n\nThe Georgian LGBTQ+ human rights and Pride organisation is now working out of the offices of Forbidden Colours.';
  it('detects the dek repeated as the opening sentence', () => {
    expect(bodyRepeatsDek(extractDek(body), body)).toBe(true);
  });
  it('ignores case, punctuation and a truncation ellipsis', () => {
    expect(bodyRepeatsDek('TBILISI PRIDE has moved its operations…', body)).toBe(true);
  });
  it('keeps a dek the body does not open with', () => {
    expect(bodyRepeatsDek('A different summary sentence.', body)).toBe(false);
    expect(bodyRepeatsDek('', body)).toBe(false);
  });
});

describe('isFreshArticle', () => {
  it('is true within the last 24h', () => {
    expect(isFreshArticle(new Date(Date.now() - 60_000).toISOString())).toBe(true);
  });

  it('is false for older articles', () => {
    expect(isFreshArticle(new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())).toBe(false);
  });

  it('is false when no date', () => {
    expect(isFreshArticle(null)).toBe(false);
  });
});

describe('IntegrityNotice', () => {
  it('renders a label for a known flag', () => {
    render(<IntegrityNotice flags={['satire']} />);
    expect(screen.getByText(/satire/i)).toBeTruthy();
  });

  it('renders nothing for no flags', () => {
    const { container } = render(<IntegrityNotice flags={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('ignores unknown flags', () => {
    const { container } = render(<IntegrityNotice flags={['totally_unknown_flag']} />);
    expect(container.firstChild).toBeNull();
  });
});
