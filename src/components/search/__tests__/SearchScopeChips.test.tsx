import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrVars?: string | Record<string, unknown>) => {
      return typeof defaultOrVars === 'string' ? defaultOrVars : key;
    },
  }),
}));

import { SearchScopeChips } from '../SearchScopeChips';

describe('SearchScopeChips', () => {
  it('renders the All chip plus one chip per supported scope', () => {
    render(<SearchScopeChips activeScope={null} onScopeChange={() => {}} />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(1);
    const allChip = screen.getAllByRole('button')[0];
    expect(allChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks the active scope and toggles back off when re-clicked', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchScopeChips activeScope="venue" onScopeChange={onChange} />);
    const venuesChip = screen.getByRole('button', { name: /Venues/i });
    expect(venuesChip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(venuesChip);
    expect(onChange).toHaveBeenCalledWith(null);

    rerender(<SearchScopeChips activeScope={null} onScopeChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Venues/i }));
    expect(onChange).toHaveBeenCalledWith('venue');
  });

  it('offers the Knowledge scopes in the results-page row', () => {
    render(<SearchScopeChips activeScope="milestone" onScopeChange={() => {}} />);
    for (const name of [/History/, /Countries/, /Organizations/, /Guides/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    // A section's "See all" lands on its scope, so that chip must show as active.
    expect(screen.getByRole('button', { name: /History/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the phone grid at the nine cells it is laid out for', () => {
    render(<SearchScopeChips activeScope={null} onScopeChange={() => {}} variant="grid" />);
    expect(screen.getAllByRole('button')).toHaveLength(9);
    expect(screen.queryByRole('button', { name: /History/ })).not.toBeInTheDocument();
  });
});
