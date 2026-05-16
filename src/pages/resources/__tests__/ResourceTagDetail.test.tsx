/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/providers/SafeModeProvider', () => ({ useSafeMode: () => false }));
vi.mock('@/hooks/useAgeAffirmation', () => ({ useAgeAffirmation: () => ({ affirmed: true, affirm: vi.fn() }) }));
vi.mock('@/components/tags/RelatedTagsCard', () => ({ RelatedTagsCard: () => null }));
vi.mock('@/components/tags/TagLinkedContent', () => ({ TagLinkedContent: () => null }));
vi.mock('@/components/age-gate/TagDetailWithGate', () => ({ TagDetailWithGate: () => <div>gate</div> }));

import { ResourceTagDetail } from '../ResourceTagDetail';

const tag = { id: 't1', name: 'safety', slug: 'safety', categories: [] } as never;

describe('ResourceTagDetail', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ResourceTagDetail
        selectedTag={tag}
        onNavigate={vi.fn()}
        onSetViewMode={vi.fn()}
        onSetSelectedCategory={vi.fn()}
        onSetSelectedSubcategory={vi.fn()}
        onTagClick={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });
});
