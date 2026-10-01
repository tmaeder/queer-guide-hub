import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders as render, screen } from '@/test/test-utils';
import { RightsNewsSection } from '../RightsNewsSection';
import { topicBySlug } from '@/lib/rights/rightsCatalog';

const hookState = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  isLoading: false,
  error: null as Error | null,
}));

vi.mock('@/hooks/useRightsNews', () => ({
  useRightsNews: () => hookState,
}));

const topic = topicBySlug('conversion-therapy')!;

describe('RightsNewsSection', () => {
  beforeEach(() => {
    hookState.data = [];
    hookState.isLoading = false;
    hookState.error = null;
  });

  it('shows exact and transparent fallback context and collapses clusters to story links', () => {
    hookState.data = [
      {
        id: 'one',
        slug: 'article-one',
        title: 'A national ban advances',
        excerpt: 'Lawmakers moved the proposal forward.',
        published_at: new Date().toISOString(),
        publisher_name: 'Example News',
        matched_tags: ['conversion-therapy'],
        relevance_tier: 'topic-local-recent',
        is_local: true,
        story_slug: 'national-ban-advances',
        story_article_count: 3,
      },
      {
        id: 'two',
        slug: 'article-two',
        title: 'A wider rights briefing',
        excerpt: null,
        published_at: new Date().toISOString(),
        publisher_name: 'Another Source',
        matched_tags: [],
        relevance_tier: 'rights-general-recent',
        is_local: false,
        story_slug: null,
        story_article_count: 1,
      },
    ];

    render(
      <RightsNewsSection
        topic={topic}
        onTopicChange={vi.fn()}
        countryId="country-ch"
        countryName="Switzerland"
      />,
    );

    expect(screen.getByText('Matches: Conversion therapy')).toBeInTheDocument();
    expect(screen.getByText('· Switzerland')).toBeInTheDocument();
    expect(screen.getByText('Broader rights coverage')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /A national ban advances/ })).toHaveAttribute(
      'href',
      '/news/story/national-ban-advances',
    );
    expect(screen.getByText('3 articles')).toBeInTheDocument();
  });

  it('changes the shared topic from the compact selector', async () => {
    hookState.data = [];
    const onTopicChange = vi.fn();
    render(<RightsNewsSection topic={topic} onTopicChange={onTopicChange} />);

    await userEvent.selectOptions(screen.getByLabelText('Reporting about'), 'marriage');
    expect(onTopicChange).toHaveBeenCalledWith(expect.objectContaining({ slug: 'marriage' }));
  });

  it('renders honest loading, error, and empty states', () => {
    hookState.isLoading = true;
    const { rerender } = render(<RightsNewsSection topic={topic} onTopicChange={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading relevant coverage');

    hookState.isLoading = false;
    hookState.error = new Error('offline');
    rerender(<RightsNewsSection topic={topic} onTopicChange={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable');

    hookState.error = null;
    hookState.data = [];
    rerender(<RightsNewsSection topic={topic} onTopicChange={vi.fn()} />);
    expect(screen.getByText(/No recent coverage matched Conversion therapy/)).toBeInTheDocument();
  });
});
