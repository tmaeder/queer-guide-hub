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
    const { rerender } = render(
      <SearchScopeChips activeScope="venue" onScopeChange={onChange} />,
    );
    const venuesChip = screen.getByRole('button', { name: /Venues/i });
    expect(venuesChip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(venuesChip);
    expect(onChange).toHaveBeenCalledWith(null);

    rerender(<SearchScopeChips activeScope={null} onScopeChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Venues/i }));
    expect(onChange).toHaveBeenCalledWith('venue');
  });
});
