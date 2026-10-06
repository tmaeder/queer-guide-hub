/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../CannedResponsePicker', () => ({
  CannedResponsePicker: () => <div data-testid="canned" />,
}));

import { ActionBar } from '../ActionBar';
import type { TriageDecisionGuidance } from '../triageDecisionGuidance';

const guidance: TriageDecisionGuidance = {
  approveLabel: 'Approve & queue',
  rejectLabel: 'Reject',
  approve: 'Marks the record approved and queues it for commit.',
  reject: 'Marks the source record rejected.',
  defer: 'Skip leaves it pending.',
};

describe('ActionBar', () => {
  const baseProps = {
    notes: '',
    cannedSlug: '',
    onAnswersChange: vi.fn(),
    onAction: vi.fn(),
    isLoading: false,
  };

  it('renders the three real action buttons', () => {
    render(<ActionBar {...baseProps} />);
    ['Approve', 'Reject', 'Skip'].forEach((l) => {
      expect(screen.getByRole('button', { name: new RegExp(l) })).toBeInTheDocument();
    });
  });

  it('does NOT render Flag — it wrote nothing on any queue', () => {
    // `triage_action` accepted 'flag' in its allowed-action list and implemented
    // it in none of its 17 queue branches, so it fell through to that
    // function's unconditional success object: the button wrote nothing,
    // anywhere, and the inbox toasted success and advanced to the next row.
    // 99991791310870 makes the RPC refuse the string. Asserted as an ABSENCE so
    // re-adding the button without a handler fails here.
    render(<ActionBar {...baseProps} />);
    expect(screen.queryByRole('button', { name: /Flag/ })).not.toBeInTheDocument();
  });

  it('disables all buttons when loading', () => {
    render(<ActionBar {...baseProps} isLoading />);
    expect(screen.getByRole('button', { name: /Approve/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reject/ })).toBeDisabled();
  });

  it('fires onAction with approve + notes', () => {
    const onAction = vi.fn();
    const onAnswersChange = vi.fn();
    render(<ActionBar {...baseProps} onAction={onAction} onAnswersChange={onAnswersChange} />);
    fireEvent.change(screen.getByPlaceholderText(/Review notes/), { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    expect(onAnswersChange).toHaveBeenCalledWith({ notes: 'ok', cannedSlug: '' });
    expect(onAction).toHaveBeenCalledWith('approve');
  });

  it('fires onAction with reject', () => {
    const onAction = vi.fn();
    render(<ActionBar {...baseProps} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }));
    expect(onAction).toHaveBeenCalledWith('reject');
  });

  it('shows both outcomes before the reviewer acts', () => {
    render(<ActionBar {...baseProps} guidance={guidance} />);
    expect(screen.getByRole('heading', { name: 'What happens next' })).toBeInTheDocument();
    expect(screen.getByText(/If you approve:/)).toBeInTheDocument();
    expect(screen.getByText(/If you don’t:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve & queue' })).toBeInTheDocument();
  });

  it('shows why approval is blocked when edits are unsaved', () => {
    render(
      <ActionBar
        {...baseProps}
        guidance={{ ...guidance, unsavedWarning: '2 unsaved corrections will not be included.' }}
        disabledActions={['approve']}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('2 unsaved corrections');
    expect(screen.getByRole('button', { name: 'Approve & queue' })).toBeDisabled();
  });
});
