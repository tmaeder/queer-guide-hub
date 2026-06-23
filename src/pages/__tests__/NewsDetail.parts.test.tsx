/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { extractDek, isFreshArticle, IntegrityNotice } from '../NewsDetail.parts';

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
