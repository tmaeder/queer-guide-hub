/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, renderHook } from '@testing-library/react';

vi.mock('@/hooks/useMilestones', () => ({
  useMilestone: () => ({
    data: {
      id: 'm1',
      slug: 'stonewall',
      title: 'Stonewall',
      description: null,
      links: [],
      sources: [],
      country_id: null,
      prev: null,
      next: null,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/pages/MilestoneDetail.meta', () => ({ buildMilestoneMeta: () => ({}) }));
vi.mock('@/pages/MilestoneDetail.parts', () => {
  const Stub = () => null;
  return {
    MilestoneHero: Stub,
    MilestoneLinkedEntities: Stub,
    MilestonePrevNext: Stub,
    MilestoneRelated: Stub,
    MilestoneSameYear: Stub,
    MilestoneSidebar: Stub,
    MilestoneSources: Stub,
    MilestoneStory: Stub,
  };
});
vi.mock('@/components/admin/AdminEditButton', () => ({
  AdminEditButton: (p: { contentType: string; contentId: string; exportable?: boolean }) => (
    <span
      data-testid="admin-edit"
      data-type={p.contentType}
      data-id={p.contentId}
      data-exportable={String(Boolean(p.exportable))}
    />
  ),
}));

import { useMilestoneDescriptor } from '../useMilestoneDescriptor';

describe('useMilestoneDescriptor admin menu', () => {
  it('opts the milestone admin menu into the record export', () => {
    const { result } = renderHook(() => useMilestoneDescriptor('stonewall'));
    const { getByTestId } = render(<>{result.current.descriptor?.hero}</>);
    const btn = getByTestId('admin-edit');
    expect(btn).toHaveAttribute('data-type', 'milestones');
    expect(btn).toHaveAttribute('data-id', 'm1');
    expect(btn).toHaveAttribute('data-exportable', 'true');
  });
});
