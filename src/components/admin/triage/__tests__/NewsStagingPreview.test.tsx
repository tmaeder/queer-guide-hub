/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewsStagingPreview } from '../NewsStagingPreview';
import { readNewsStaging } from '@/lib/newsStaging';

vi.mock('@/hooks/useExplanations', () => ({
  useExplanations: () => ({
    data: new Map([
      [
        'news-gate:low_relevance',
        {
          key: 'news-gate:low_relevance',
          title: 'Not clearly LGBTQ+ relevant',
          body: 'The quality check judged the article not relevant.',
          what_now: 'Read the article.',
          severity: 'warning',
        },
      ],
    ]),
  }),
}));

const normalized = {
  name: 'Pride march returns to Atlanta',
  description: '<p>Raw description body</p>',
  sourceName: 'The Gayly Dose',
  urls: ['https://example.com/story'],
  images: ['https://img.example.com/a.jpg'],
  dates: { start: '2026-10-01T10:00:00Z' },
};

describe('NewsStagingPreview', () => {
  it('renders the article, verdict, explained and unexplained reasons, and linked names', () => {
    const news = readNewsStaging(normalized, {
      ai_lgbtq_relevance_score: 0.9,
      review_reason: 'llm_needs_review',
      auto_publish_blocked_reasons: ['low_relevance', 'brand_new_reason'],
      quality_decision: {
        shouldPublish: false,
        confidence: 0.62,
        relevanceScore: 0.5,
        isSatire: true,
        warnings: ['Georgia is ambiguous'],
        cleanedBody: '<p>Cleaned body text</p>',
        excerpt: 'Short excerpt',
        imageAssessment: { isUsable: false, reason: 'Logo, not a photo' },
        linkedCities: ['Atlanta'],
        linkedPersonalities: ['Ginger Nichols'],
      },
    });
    render(<NewsStagingPreview news={news} />);

    expect(screen.getByRole('heading', { name: 'Pride march returns to Atlanta' })).not.toBeNull();
    expect(screen.getByText(/The Gayly Dose/)).not.toBeNull();
    expect(screen.getByRole('link', { name: /Original on example.com/ })).not.toBeNull();
    expect(screen.getByText('Cleaned body text')).not.toBeNull();
    expect(screen.queryByText('Raw description body')).toBeNull();
    expect(screen.getByText(/not usable — Logo, not a photo/)).not.toBeNull();

    expect(screen.getByText('Reject')).not.toBeNull();
    expect(screen.getByText('Satire')).not.toBeNull();
    expect(screen.getByText('62%')).not.toBeNull();
    expect(screen.getByText('90%')).not.toBeNull();
    expect(screen.getByText('Georgia is ambiguous')).not.toBeNull();

    expect(screen.getByText('Not clearly LGBTQ+ relevant')).not.toBeNull();
    // Unregistered keys stay raw, never prettified.
    expect(screen.getByText('news-gate:brand_new_reason')).not.toBeNull();
    expect(screen.getByText('news-review:llm_needs_review')).not.toBeNull();
    expect(screen.queryByText(/Brand New Reason/i)).toBeNull();

    expect(screen.getByText('Atlanta')).not.toBeNull();
    expect(screen.getByText('Ginger Nichols')).not.toBeNull();
  });

  it('shows the no-verdict state and falls back to the raw description', () => {
    const news = readNewsStaging(normalized, { review_reason: 'awaiting_llm_verdict' });
    render(<NewsStagingPreview news={news} />);
    expect(screen.getByText(/Verdict pending/)).not.toBeNull();
    expect(screen.getByText('Raw description body')).not.toBeNull();
  });

  it('shows recovered source text and the fresh quality requirement', () => {
    const news = readNewsStaging(
      {
        ...normalized,
        content: 'Complete publisher article',
        extraction_meta: {
          url: 'https://example.com/story',
          page_title: normalized.name,
          original_length: 180,
          extracted_length: 2400,
        },
      },
      {
        review_source_text_recovery: {
          contract: 'news_source_text_recovery.v1',
          status: 'recovered',
          attempts: 1,
        },
      },
    );
    render(<NewsStagingPreview news={news} />);
    expect(screen.getByText('Complete publisher article')).not.toBeNull();
    expect(screen.getByText('Full article recovered; quality check pending')).not.toBeNull();
    expect(screen.getByText(/A fresh quality check must pass/)).not.toBeNull();
    expect(
      screen.getByRole('link', { name: /Check the publisher page/ }).getAttribute('href'),
    ).toBe('https://example.com/story');
  });

  it('shows identity evidence when source recovery cannot confirm the headline', () => {
    const news = readNewsStaging(
      {
        ...normalized,
        extraction_meta: { page_title: 'Publisher home page', reason: 'page_identity_unconfirmed' },
      },
      {
        review_source_text_recovery: {
          contract: 'news_source_text_recovery.v1',
          status: 'no_gain',
          attempts: 1,
        },
      },
    );
    render(<NewsStagingPreview news={news} />);
    expect(screen.getByText(/Publisher home page/)).not.toBeNull();
    expect(screen.getByText(/correct its URL before approving/)).not.toBeNull();
    expect(screen.getByText('Raw description body')).not.toBeNull();
  });

  it('does not show an exhausted expired attempt as still running', () => {
    const news = readNewsStaging(normalized, {
      review_source_text_recovery: {
        contract: 'news_source_text_recovery.v1',
        status: 'running',
        attempts: 2,
        lease_expires_at: '2020-01-01T00:00:00Z',
      },
    });
    render(<NewsStagingPreview news={news} />);
    expect(screen.getByText('Automatic source recovery was interrupted')).not.toBeNull();
    expect(screen.queryByText('Recovering the full article')).toBeNull();
  });
});
