/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/providers/SafeModeProvider', () => ({ useSafeMode: () => false }));
vi.mock('@/components/resources/TagListRenderer', () => ({ TagListRenderer: () => <div>tags</div> }));
vi.mock('@/components/resources/categoryMeta', () => ({
  getCategoryIcon: () => null,
  getCategoryShortName: (s: string) => s,
}));

import { ResourceOverview } from '../ResourceOverview';

describe('ResourceOverview', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter>
        <ResourceOverview popularTags={[]} orderedParents={[]} tagUsageCounts={{}} professionCount={0} onTagClick={vi.fn()} onShowProfessions={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
