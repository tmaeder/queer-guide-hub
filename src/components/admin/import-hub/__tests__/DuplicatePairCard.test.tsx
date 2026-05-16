/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useEntityByIdMock, useDismissDuplicateMock, dismissMutate } = vi.hoisted(() => ({
  useEntityByIdMock: vi.fn(),
  useDismissDuplicateMock: vi.fn(),
  dismissMutate: vi.fn(),
}));

vi.mock('@/hooks/useImportHubQueries', () => ({
  useEntityById: useEntityByIdMock,
  useDismissDuplicate: useDismissDuplicateMock,
}));
vi.mock('../StructuredFieldDisplay', () => ({
  StructuredFieldDisplay: () => <div data-testid="sfd" />,
}));

import { DuplicatePairCard } from '../DuplicatePairCard';

const pair = {
  id: 'p1', entity_type: 'venues', entity_a_id: 'a-1234', entity_b_id: 'b-5678',
  match_method: 'name_similarity', confidence: 0.92,
} as never;

beforeEach(() => {
  useEntityByIdMock.mockReset();
  useDismissDuplicateMock.mockReset();
  dismissMutate.mockReset();
  useDismissDuplicateMock.mockReturnValue({ mutate: dismissMutate, isPending: false });
});

describe('DuplicatePairCard', () => {
  it('renders header badges + confidence', () => {
    useEntityByIdMock.mockReturnValueOnce({ data: { name: 'Alpha' }, isLoading: false });
    useEntityByIdMock.mockReturnValueOnce({ data: { name: 'Beta' }, isLoading: false });
    render(<DuplicatePairCard pair={pair} onMerge={vi.fn()} />);
    expect(screen.getByText('venues')).toBeInTheDocument();
    expect(screen.getByText('name_similarity')).toBeInTheDocument();
    expect(screen.getByText(/92% \(High\)/)).toBeInTheDocument();
  });

  it('shows A vs B preview with name field', () => {
    useEntityByIdMock.mockReturnValueOnce({ data: { name: 'Alpha' }, isLoading: false });
    useEntityByIdMock.mockReturnValueOnce({ data: { name: 'Beta' }, isLoading: false });
    render(<DuplicatePairCard pair={pair} onMerge={vi.fn()} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('Merge button fires onMerge', () => {
    useEntityByIdMock.mockReturnValueOnce({ data: { name: 'A' }, isLoading: false });
    useEntityByIdMock.mockReturnValueOnce({ data: { name: 'B' }, isLoading: false });
    const onMerge = vi.fn();
    render(<DuplicatePairCard pair={pair} onMerge={onMerge} />);
    fireEvent.click(screen.getByRole('button', { name: /Merge/ }));
    expect(onMerge).toHaveBeenCalledWith(pair);
  });

  it('Not Duplicate dismisses', () => {
    useEntityByIdMock.mockReturnValueOnce({ data: { name: 'A' }, isLoading: false });
    useEntityByIdMock.mockReturnValueOnce({ data: { name: 'B' }, isLoading: false });
    render(<DuplicatePairCard pair={pair} onMerge={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Not Duplicate/ }));
    expect(dismissMutate).toHaveBeenCalledWith('p1');
  });

  it('Compare button reveals structured field display', () => {
    useEntityByIdMock.mockImplementation((_t: string, id: string) => ({
      data: { name: id?.startsWith('a') ? 'A' : 'B' },
      isLoading: false,
    }));
    render(<DuplicatePairCard pair={pair} onMerge={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Compare/ }));
    expect(screen.getAllByTestId('sfd').length).toBe(2);
  });
});
