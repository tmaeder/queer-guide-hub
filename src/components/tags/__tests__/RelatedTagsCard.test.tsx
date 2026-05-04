import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { SafeModeProvider } from '@/providers/SafeModeProvider';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) },
}));

// Controllable mock for useSimilarTags
let mockSimilarData: unknown[] = [];
let mockLoading = false;
vi.mock('@/hooks/useTagRelationships', () => ({
  useSimilarTags: () => ({ data: mockSimilarData, isLoading: mockLoading }),
}));

import { RelatedTagsCard } from '../RelatedTagsCard';

const w = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <SafeModeProvider>{children}</SafeModeProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  mockSimilarData = [];
  mockLoading = false;
  localStorage.clear();
});

describe('RelatedTagsCard', () => {
  it('shows loading skeleton when loading', () => {
    mockLoading = true;
    render(<RelatedTagsCard tagId="t-1" onTagClick={vi.fn()} />, { wrapper: w });
    expect(screen.getByText('Related')).toBeInTheDocument();
  });

  it('renders nothing when no similar tags', () => {
    mockSimilarData = [];
    const { container } = render(<RelatedTagsCard tagId="t-1" onTagClick={vi.fn()} />, { wrapper: w });
    expect(container.innerHTML).toBe('');
  });

  it('renders tag badges as links', () => {
    localStorage.setItem('qg_safe_mode', 'off');
    mockSimilarData = [
      { tag_id: '1', name: 'Leather', slug: 'leather', category: 'Gear & Aesthetics', similarity_score: 0.9, relationship_type: 'embedding', usage_count: 5, image_url: null },
      { tag_id: '2', name: 'Bear', slug: 'bear', category: 'Identity & Expression', similarity_score: 0.8, relationship_type: 'embedding', usage_count: 10, image_url: null },
    ];
    render(<RelatedTagsCard tagId="t-1" onTagClick={vi.fn()} />, { wrapper: w });
    expect(screen.getByText('Leather')).toBeInTheDocument();
    expect(screen.getByText('Bear')).toBeInTheDocument();
  });

  it('filters adult-category tags when safe mode is on (default)', () => {
    mockSimilarData = [
      { tag_id: '1', name: 'Fisting', slug: 'fisting', category: 'Practices & Play', similarity_score: 0.95, relationship_type: 'embedding', usage_count: 5, image_url: null },
      { tag_id: '2', name: 'Bear', slug: 'bear', category: 'Body Types & Archetypes', similarity_score: 0.85, relationship_type: 'embedding', usage_count: 10, image_url: null },
      { tag_id: '3', name: 'Community', slug: 'community', category: 'Community & Culture', similarity_score: 0.7, relationship_type: 'co_occurrence', usage_count: 20, image_url: null },
    ];
    // Safe mode defaults to 'on'
    render(<RelatedTagsCard tagId="t-1" onTagClick={vi.fn()} />, { wrapper: w });
    expect(screen.queryByText('Fisting')).not.toBeInTheDocument();
    expect(screen.queryByText('Bear')).not.toBeInTheDocument();
    expect(screen.getByText('Community')).toBeInTheDocument();
  });

  it('shows adult-category tags when safe mode is off', () => {
    localStorage.setItem('qg_safe_mode', 'off');
    mockSimilarData = [
      { tag_id: '1', name: 'Fisting', slug: 'fisting', category: 'Practices & Play', similarity_score: 0.95, relationship_type: 'embedding', usage_count: 5, image_url: null },
      { tag_id: '3', name: 'Community', slug: 'community', category: 'Community & Culture', similarity_score: 0.7, relationship_type: 'co_occurrence', usage_count: 20, image_url: null },
    ];
    render(<RelatedTagsCard tagId="t-1" onTagClick={vi.fn()} />, { wrapper: w });
    expect(screen.getByText('Fisting')).toBeInTheDocument();
    expect(screen.getByText('Community')).toBeInTheDocument();
  });

  it('prefers within-category tags (sorted first)', () => {
    mockSimilarData = [
      { tag_id: '1', name: 'OutTag', slug: 'out', category: 'Other', similarity_score: 0.95, relationship_type: 'embedding', usage_count: 5, image_url: null },
      { tag_id: '2', name: 'InTag', slug: 'in', category: 'Identity & Expression', similarity_score: 0.80, relationship_type: 'embedding', usage_count: 10, image_url: null },
    ];
    localStorage.setItem('qg_safe_mode', 'off');
    render(
      <RelatedTagsCard tagId="t-1" sourceCategory="Identity & Expression" onTagClick={vi.fn()} />,
      { wrapper: w },
    );
    const badges = screen.getAllByRole('link');
    // Within-category tag should come first despite lower score
    expect(badges[0]).toHaveTextContent('InTag');
    expect(badges[1]).toHaveTextContent('OutTag');
  });
});
