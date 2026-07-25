/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EntityReviewQueue, type ReviewQueueRowBase } from '../EntityReviewQueue';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

interface Row extends ReviewQueueRowBase {
  name: string;
  risky?: boolean;
}

const baseProps = {
  title: 'Review queue — test',
  description: 'Test queue.',
  isLoading: false,
  entityName: (r: Row) => r.name,
  renderBody: (r: Row) => <span>{r.name}-value</span>,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EntityReviewQueue', () => {
  it('renders empty state', () => {
    render(<EntityReviewQueue<Row> {...baseProps} rows={[]} onDecide={vi.fn()} />);
    expect(screen.getByText('No items awaiting review.')).toBeTruthy();
  });

  it('approves without confirm when no guard matches', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(
      <EntityReviewQueue<Row>
        {...baseProps}
        rows={[{ id: '1', name: 'Berlin' }]}
        approveGuard={(r) => (r.risky ? 'Sure?' : null)}
        onDecide={onDecide}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'approve', false));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('blocks approval when the guard confirm is declined', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <EntityReviewQueue<Row>
        {...baseProps}
        rows={[{ id: '1', name: 'Doha', risky: true }]}
        approveGuard={(r) => (r.risky ? 'Criminalizing — confirm?' : null)}
        onDecide={onDecide}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    expect(window.confirm).toHaveBeenCalledWith('Criminalizing — confirm?');
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('passes confirmed=true through after guard confirm', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <EntityReviewQueue<Row>
        {...baseProps}
        rows={[{ id: '1', name: 'Doha', risky: true }]}
        approveGuard={(r) => (r.risky ? 'Criminalizing — confirm?' : null)}
        onDecide={onDecide}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'approve', true));
  });

  it('rejects without invoking the guard', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    const guard = vi.fn().mockReturnValue('nope');
    render(
      <EntityReviewQueue<Row>
        {...baseProps}
        rows={[{ id: '1', name: 'Berlin' }]}
        approveGuard={guard}
        onDecide={onDecide}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'reject', false));
    expect(guard).not.toHaveBeenCalled();
  });

  it('shows the batch button only when count > 0 and runs it', async () => {
    const run = vi.fn().mockResolvedValue(3);
    const { rerender } = render(
      <EntityReviewQueue<Row>
        {...baseProps}
        rows={[{ id: '1', name: 'A' }]}
        onDecide={vi.fn()}
        batch={{ count: 0, label: (n) => `Approve ${n}`, run, successMessage: (n) => `${n} ok` }}
      />,
    );
    expect(screen.queryByRole('button', { name: /Approve 0/ })).toBeNull();
    rerender(
      <EntityReviewQueue<Row>
        {...baseProps}
        rows={[{ id: '1', name: 'A' }]}
        onDecide={vi.fn()}
        batch={{ count: 3, label: (n) => `Approve ${n}`, run, successMessage: (n) => `${n} ok` }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Approve 3/ }));
    await waitFor(() => expect(run).toHaveBeenCalled());
  });
});
