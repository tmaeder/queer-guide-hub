import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrVars?: string | Record<string, unknown>, vars?: Record<string, string>) => {
      const isDefault = typeof defaultOrVars === 'string';
      let out = isDefault ? (defaultOrVars as string) : key;
      const v = (isDefault ? vars : (defaultOrVars as Record<string, string>)) || {};
      for (const [k, val] of Object.entries(v)) out = out.replace(`{{${k}}}`, String(val));
      return out;
    },
  }),
}));

import { ActiveFilterChips } from '../ActiveFilterChips';

describe('ActiveFilterChips', () => {
  it('renders nothing when no filters are active', () => {
    const { container } = render(
      <ActiveFilterChips filters={{}} onFiltersChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a chip per active filter and supports per-chip removal', () => {
    const onChange = vi.fn();
    render(
      <ActiveFilterChips
        filters={{ types: ['venue'], location: 'Berlin', featured: true }}
        onFiltersChange={onChange}
      />,
    );
    expect(screen.getByText('Venues')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Featured')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Remove filter Berlin/));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ location: undefined }),
    );
  });

  it('Clear all resets every filter', () => {
    const onChange = vi.fn();
    render(
      <ActiveFilterChips
        filters={{ types: ['venue'], rating: 4 }}
        onFiltersChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Clear all/i }));
    expect(onChange).toHaveBeenCalledWith({});
  });
});
