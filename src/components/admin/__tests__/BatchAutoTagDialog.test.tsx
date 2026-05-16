/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useAutoTagMock, batchAutoTagFn } = vi.hoisted(() => ({
  useAutoTagMock: vi.fn(),
  batchAutoTagFn: vi.fn(),
}));

vi.mock('@/hooks/useAutoTag', () => ({ useAutoTag: useAutoTagMock }));

import BatchAutoTagDialog from '../BatchAutoTagDialog';

describe('BatchAutoTagDialog', () => {
  it('renders trigger button', () => {
    useAutoTagMock.mockReturnValue({ loading: false, batchProgress: null, batchAutoTag: batchAutoTagFn });
    render(<BatchAutoTagDialog />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('opens dialog and shows content type select', () => {
    useAutoTagMock.mockReturnValue({ loading: false, batchProgress: null, batchAutoTag: batchAutoTagFn });
    render(<BatchAutoTagDialog />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText(/Venues/)).toBeInTheDocument();
  });
});
