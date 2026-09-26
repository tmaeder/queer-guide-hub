/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../CannedResponsePicker', () => ({
  CannedResponsePicker: () => <div data-testid="canned" />,
}));

import { ActionBar } from '../ActionBar';

/**
 * ActionBar is CONTROLLED since the decision resolver landed.
 *
 * It used to hold `notes` and `cannedSlug` in local `useState` while being rendered
 * with no `key`, so a typed note survived the queue advancing and attached itself to
 * the NEXT item — and the keyboard path never reached that state at all, so `r` sent
 * a rejection with no note while leaving the text in the box. The answers live in
 * `TriageView` now, keyed by item id.
 *
 * So these assert the CONTRACT: the bar reports edits up and asks for an action.
 * What an action then carries is `resolveDecision`'s job, tested there.
 */
const props = {
  notes: '',
  cannedSlug: '',
  onAnswersChange: vi.fn(),
  isLoading: false,
};

describe('ActionBar', () => {
  it('renders all four action buttons', () => {
    render(<ActionBar {...props} onAction={vi.fn()} />);
    ['Approve', 'Reject', 'Skip', 'Flag'].forEach((l) => {
      expect(screen.getByRole('button', { name: new RegExp(l) })).toBeInTheDocument();
    });
  });

  it('disables all buttons when loading', () => {
    render(<ActionBar {...props} onAction={vi.fn()} isLoading />);
    expect(screen.getByRole('button', { name: /Approve/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reject/ })).toBeDisabled();
  });

  it('reports a typed note up rather than keeping it', () => {
    const onAnswersChange = vi.fn();
    render(<ActionBar {...props} onAnswersChange={onAnswersChange} onAction={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Review notes/), { target: { value: 'ok' } });
    // The slug clears alongside: the note is no longer the template, so recording
    // which template was used would misattribute it.
    expect(onAnswersChange).toHaveBeenCalledWith({ notes: 'ok', cannedSlug: '' });
  });

  it('renders the note it is given', () => {
    render(<ActionBar {...props} notes="from the parent" onAction={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Review notes/)).toHaveValue('from the parent');
  });

  it('fires onAction with approve', () => {
    const onAction = vi.fn();
    render(<ActionBar {...props} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    expect(onAction).toHaveBeenCalledWith('approve');
  });

  it('fires onAction with reject', () => {
    const onAction = vi.fn();
    render(<ActionBar {...props} onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }));
    expect(onAction).toHaveBeenCalledWith('reject');
  });

  it('does not clear the note on acting', () => {
    // The old bar wiped its own state here, which is why Skip — the "come back to
    // this" action — silently discarded the reasoning you typed for coming back.
    const onAnswersChange = vi.fn();
    render(
      <ActionBar {...props} notes="keep me" onAnswersChange={onAnswersChange} onAction={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    expect(onAnswersChange).not.toHaveBeenCalled();
  });
});
