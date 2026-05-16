/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/components/resources/TagListRenderer', () => ({ TagListRenderer: () => null }));

import { ResourceCategory } from '../ResourceCategory';

describe('ResourceCategory', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ResourceCategory
        selectedCategory="Safety"
        categoriesTree={[]}
        allTags={[]}
        tagUsageCounts={{}}
        displayMode={'grid' as never}
        onTagClick={vi.fn()}
        onBack={vi.fn()}
        onSelectSubcategory={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });
});
