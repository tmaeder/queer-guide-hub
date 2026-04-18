import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/test-utils';

// Supabase mock — returns a canned list of cities for any query
const mockLimit = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        ilike: () => ({
          order: () => ({
            limit: mockLimit,
          }),
        }),
      }),
    }),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { CityCountryAutocomplete } from '../create/CityCountryAutocomplete';

describe('CityCountryAutocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue({
      data: [
        {
          id: 'city-berlin',
          name: 'Berlin',
          timezone: 'Europe/Berlin',
          country: { id: 'country-de', name: 'Germany', code: 'DE' },
        },
        {
          id: 'city-bern',
          name: 'Bern',
          timezone: 'Europe/Zurich',
          country: { id: 'country-ch', name: 'Switzerland', code: 'CH' },
        },
      ],
      error: null,
    });
  });

  it('renders the text field with the provided label', () => {
    renderWithProviders(
      <CityCountryAutocomplete value={null} onChange={vi.fn()} label="Where to?" />,
    );
    expect(screen.getByLabelText(/Where to\?/)).toBeInTheDocument();
  });

  it('fires onChange with a GeoSelection when an option is picked', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <CityCountryAutocomplete value={null} onChange={onChange} label="city" />,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ber' } });

    const option = await waitFor(() => screen.getByText('Berlin'));
    fireEvent.mouseDown(option);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cityId: 'city-berlin',
        cityName: 'Berlin',
        countryId: 'country-de',
        countryCode: 'DE',
        timezone: 'Europe/Berlin',
      }),
    );
  });

  it('closes the listbox on Escape', async () => {
    renderWithProviders(
      <CityCountryAutocomplete value={null} onChange={vi.fn()} label="city" />,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ber' } });
    await waitFor(() => screen.getByText('Berlin'));
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
    });
  });

  it('does not search for queries shorter than 2 characters', async () => {
    renderWithProviders(
      <CityCountryAutocomplete value={null} onChange={vi.fn()} label="city" />,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'B' } });
    // Wait a beat for debounce to settle
    await new Promise((r) => setTimeout(r, 350));
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it('shows the fallback CTA when no cities match and a handler is wired', async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null });
    const onFallback = vi.fn();
    renderWithProviders(
      <CityCountryAutocomplete
        value={null}
        onChange={vi.fn()}
        onFallbackRequested={onFallback}
        label="city"
      />,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Nowhereville' } });

    const cta = await waitFor(() =>
      screen.getByText(/trips\.create\.addNewPlace/),
    );
    fireEvent.click(cta);
    expect(onFallback).toHaveBeenCalledWith('Nowhereville');
  });
});
