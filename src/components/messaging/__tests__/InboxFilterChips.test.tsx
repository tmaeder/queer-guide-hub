import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrVars?: string | Record<string, unknown>) => {
      if (typeof defaultOrVars === 'string') return defaultOrVars;
      if (defaultOrVars && typeof defaultOrVars === 'object' && 'defaultValue' in defaultOrVars) {
        return defaultOrVars.defaultValue as string;
      }
      return key;
    },
  }),
}));

import { InboxFilterChips } from '../InboxFilterChips';

describe('InboxFilterChips', () => {
  it('renders four chips and fires onChange', () => {
    const onChange = vi.fn();
    render(<InboxFilterChips value="all" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: /all/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /mail/i }));
    expect(onChange).toHaveBeenCalledWith('mail');
  });
});
