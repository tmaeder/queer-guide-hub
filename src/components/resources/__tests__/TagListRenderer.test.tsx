import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { TagListRenderer } from '../TagListRenderer';
import type { CentralizedTag } from '@/hooks/useCentralizedTags';

const tags: CentralizedTag[] = [
  // Minimal shape — extra fields filled with safe defaults.
  {
    id: 't1',
    name: 'Zucchini',
    slug: 'zucchini',
    description: '',
    image_url: null,
    usage_count: 5,
    status: 'active',
    categories: [],
  } as unknown as CentralizedTag,
  {
    id: 't2',
    name: 'BDSM',
    slug: 'bdsm',
    description: '',
    image_url: null,
    usage_count: 41,
    status: 'active',
    categories: [],
  } as unknown as CentralizedTag,
];

const wrap = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe('TagListRenderer chips (P1-3)', () => {
  it('renders chips as anchors with /resources/<slug> hrefs (single click navigates)', () => {
    const { getByText } = render(
      <TagListRenderer
        tags={tags}
        displayMode="chips"
        tagUsageCounts={{ Zucchini: 5, BDSM: 41 }}
        onTagClick={vi.fn()}
      />,
      { wrapper: wrap },
    );

    const zucchiniLink = getByText('Zucchini').closest('a');
    expect(zucchiniLink).not.toBeNull();
    expect(zucchiniLink?.getAttribute('href')).toBe('/resources/zucchini');

    const bdsmLink = getByText('BDSM').closest('a');
    expect(bdsmLink?.getAttribute('href')).toBe('/resources/bdsm');
  });

  it('chips are anchors, not buttons', () => {
    const { getByText } = render(
      <TagListRenderer
        tags={[tags[0]]}
        displayMode="chips"
        tagUsageCounts={{}}
        onTagClick={vi.fn()}
      />,
      { wrapper: wrap },
    );
    const link = getByText('Zucchini').closest('a');
    expect(link).not.toBeNull();
    // Same element should NOT be inside a <button>.
    expect(getByText('Zucchini').closest('button')).toBeNull();
  });
});
