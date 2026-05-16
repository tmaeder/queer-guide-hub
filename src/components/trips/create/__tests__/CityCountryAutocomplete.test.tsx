/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) },
}));
vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

import { CityCountryAutocomplete } from '../CityCountryAutocomplete';

describe('CityCountryAutocomplete', () => {
  it('renders label and input', () => {
    render(<CityCountryAutocomplete value={null} onChange={vi.fn()} label="City" />);
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows current selection when value provided', () => {
    render(
      <CityCountryAutocomplete
        value={{ cityId: 'c1', cityName: 'Berlin', countryId: 'co-de', countryName: 'Germany', countryCode: 'DE', timezone: null }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Berlin, Germany')).toBeInTheDocument();
  });

  it('updates query when user types', () => {
    render(<CityCountryAutocomplete value={null} onChange={vi.fn()} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Ber' } });
    expect(input).toHaveValue('Ber');
  });
});
