/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useEntityByIdMock, useMergeEntitiesMock, sbsSpy } = vi.hoisted(() => ({
  useEntityByIdMock: vi.fn(),
  useMergeEntitiesMock: vi.fn(),
  sbsSpy: vi.fn(),
}));

vi.mock('@/hooks/useImportHubQueries', () => ({
  useEntityById: useEntityByIdMock,
  useMergeEntities: useMergeEntitiesMock,
}));
vi.mock('../SideBySideComparison', () => ({
  SideBySideComparison: (p: unknown) => { sbsSpy(p); return <div data-testid="sbs" />; },
}));

import { MergeDialog } from '../MergeDialog';

beforeEach(() => {
  useEntityByIdMock.mockReset();
  useMergeEntitiesMock.mockReset();
  sbsSpy.mockReset();
  useMergeEntitiesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
});

describe('MergeDialog', () => {
  it('shows loading state while either entity is loading', () => {
    useEntityByIdMock
      .mockReturnValueOnce({ data: null, isLoading: true })
      .mockReturnValueOnce({ data: null, isLoading: false });
    render(<MergeDialog open entityType="venues" entityAId="a" entityBId="b" onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(screen.getByText(/Loading records/i)).toBeInTheDocument();
  });

  it('shows not-found message when either entity missing post-load', () => {
    useEntityByIdMock
      .mockReturnValueOnce({ data: null, isLoading: false })
      .mockReturnValueOnce({ data: { id: 'b', name: 'B' }, isLoading: false });
    render(<MergeDialog open entityType="venues" entityAId="a" entityBId="b" onOpenChange={vi.fn()} />);
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it('renders SideBySideComparison when both entities load; uses name field', () => {
    useEntityByIdMock
      .mockReturnValueOnce({ data: { id: 'a', name: 'Alpha' }, isLoading: false })
      .mockReturnValueOnce({ data: { id: 'b', name: 'Beta' }, isLoading: false });
    render(<MergeDialog open entityType="venues" entityAId="a" entityBId="b" onOpenChange={vi.fn()} />);
    expect(screen.getByTestId('sbs')).toBeInTheDocument();
    expect(sbsSpy.mock.calls[0][0].leftLabel).toBe('Alpha');
    expect(sbsSpy.mock.calls[0][0].rightLabel).toBe('Beta');
  });

  it("uses 'title' field for events", () => {
    useEntityByIdMock
      .mockReturnValueOnce({ data: { id: 'a', title: 'EventA' }, isLoading: false })
      .mockReturnValueOnce({ data: { id: 'b', title: 'EventB' }, isLoading: false });
    render(<MergeDialog open entityType="events" entityAId="a" entityBId="b" onOpenChange={vi.fn()} />);
    expect(sbsSpy.mock.calls[0][0].leftLabel).toBe('EventA');
  });
});
