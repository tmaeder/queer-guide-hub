import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { FromTheGlossary } from '../FromTheGlossary';
import type { TagPreview } from '@/hooks/useTagPreviews';

const previews: TagPreview[] = [];
let affirmed = false;

vi.mock('@/hooks/useTagPreviews', () => ({
  useTagPreviews: () => ({ data: previews }),
}));
vi.mock('@/hooks/useAgeAffirmation', () => ({
  useAgeAffirmation: () => ({ affirmed }),
}));

function makePreview(overrides: Partial<TagPreview>): TagPreview {
  return {
    id: overrides.slug ?? 'x',
    slug: 'x',
    name: 'X',
    short_description: null,
    description: null,
    category: null,
    is_adult: false,
    is_sensitive: false,
    image_url: null,
    usage_count: 0,
    ...overrides,
  };
}

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('FromTheGlossary', () => {
  beforeEach(() => {
    previews.length = 0;
    affirmed = false;
  });

  it('renders nothing for empty or undefined tags', () => {
    const { container } = wrap(<FromTheGlossary tags={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no tag has a definition', () => {
    previews.push(makePreview({ slug: 'bear-bar', name: 'Bear bar' }));
    const { container } = wrap(<FromTheGlossary tags={['bear-bar']} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders defined terms as definition cards', () => {
    previews.push(
      makePreview({ slug: 'bear-bar', name: 'Bear bar', short_description: 'A bar for bears.' }),
    );
    wrap(<FromTheGlossary tags={['bear-bar']} />);
    expect(screen.getByText('From the glossary')).toBeInTheDocument();
    expect(screen.getByText('A bar for bears.')).toBeInTheDocument();
  });

  it('drops adult terms entirely when unaffirmed', () => {
    previews.push(
      makePreview({ slug: 'kink', name: 'Kink', short_description: 'Def.', is_adult: true }),
    );
    const { container } = wrap(<FromTheGlossary tags={['kink']} />);
    expect(container.firstChild).toBeNull();
  });

  it('keeps adult terms once affirmed', () => {
    affirmed = true;
    previews.push(
      makePreview({ slug: 'kink', name: 'Kink', short_description: 'Def.', is_adult: true }),
    );
    wrap(<FromTheGlossary tags={['kink']} />);
    expect(screen.getByText('Def.')).toBeInTheDocument();
  });

  it('caps at max, ranked by definition richness then usage', () => {
    previews.push(
      makePreview({ slug: 'a', name: 'Alpha', description: 'Long only.', usage_count: 1 }),
      makePreview({ slug: 'b', name: 'Beta', short_description: 'Short.', usage_count: 5 }),
      makePreview({ slug: 'c', name: 'Gamma', short_description: 'Short too.', usage_count: 9 }),
    );
    wrap(<FromTheGlossary tags={['a', 'b', 'c']} max={2} />);
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });
});
