/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { CitiesFilterBar } from '../CitiesFilterBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, d?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const def = typeof d === 'string' ? d : _k;
      const o = (typeof d === 'object' ? d : opts) ?? {};
      return def.replace(/\{\{(\w+)\}\}/g, (_, k) => String((o as Record<string, unknown>)[k] ?? ''));
    },
  }),
}));

function setup(overrides: Partial<React.ComponentProps<typeof CitiesFilterBar>> = {}) {
  const props: React.ComponentProps<typeof CitiesFilterBar> = {
    q: '',
    onQChange: vi.fn(),
    continents: [
      { code: 'EU', name: 'Europe' },
      { code: 'AS', name: 'Asia' },
      { code: 'NA', name: 'North America' },
    ],
    selectedContinents: new Set(),
    onToggleContinent: vi.fn(),
    selectedTiers: new Set(),
    onToggleTier: vi.fn(),
    sort: 'population',
    onSortChange: vi.fn(),
    totalCount: 247,
    filteredCount: 247,
    onReset: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<CitiesFilterBar {...props} />);
  return props;
}

describe('CitiesFilterBar', () => {
  it('renders the result count', () => {
    setup({ totalCount: 247, filteredCount: 36 });
    expect(screen.getByRole('status')).toHaveTextContent('36 of 247 cities');
  });

  it('renders one chip per continent', () => {
    setup();
    const group = screen.getByRole('group', { name: /continent/i });
    expect(within(group).getByRole('button', { name: 'Europe' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Asia' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'North America' })).toBeInTheDocument();
  });

  it('clicking a continent chip calls onToggleContinent with the code', () => {
    const props = setup();
    const group = screen.getByRole('group', { name: /continent/i });
    fireEvent.click(within(group).getByRole('button', { name: 'Europe' }));
    expect(props.onToggleContinent).toHaveBeenCalledWith('EU');
  });

  it('marks selected continent chips with aria-pressed', () => {
    setup({ selectedContinents: new Set(['eu']) });
    const group = screen.getByRole('group', { name: /continent/i });
    expect(within(group).getByRole('button', { name: 'Europe' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'Asia' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders all 6 equality tier chips', () => {
    setup();
    const group = screen.getByRole('group', { name: /equality/i });
    for (const label of ['Very High', 'High', 'Moderate', 'Low', 'Very Low', 'No data']) {
      expect(within(group).getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('clicking a tier chip calls onToggleTier with the tier slug', () => {
    const props = setup();
    const group = screen.getByRole('group', { name: /equality/i });
    fireEvent.click(within(group).getByRole('button', { name: 'Very High' }));
    expect(props.onToggleTier).toHaveBeenCalledWith('very-high');
  });

  it('search input emits onQChange', () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText('Search cities…'), {
      target: { value: 'ber' },
    });
    expect(props.onQChange).toHaveBeenCalledWith('ber');
  });

  it('Reset button is hidden when no filters active', () => {
    setup();
    expect(screen.queryByRole('button', { name: /reset filters/i })).not.toBeInTheDocument();
  });

  it('Reset button appears when q is set and triggers onReset', () => {
    const props = setup({ q: 'ber' });
    const btn = screen.getByRole('button', { name: /reset filters/i });
    fireEvent.click(btn);
    expect(props.onReset).toHaveBeenCalled();
  });

  it('Reset button appears when continent or tier filters are active', () => {
    setup({ selectedContinents: new Set(['eu']) });
    expect(screen.getByRole('button', { name: /reset filters/i })).toBeInTheDocument();
  });
});
