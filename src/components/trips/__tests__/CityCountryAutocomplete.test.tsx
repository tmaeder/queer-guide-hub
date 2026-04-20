import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from '@/test/test-utils';

type CityRow = {
  id: string;
  name: string;
  timezone: string | null;
  country: { id: string; name: string; code: string | null };
};

const { mockLimit, mockFrom, getLastQuery } = vi.hoisted(() => {
  let lastQuery = '';
  const mockLimit = vi.fn<[], Promise<{ data: CityRow[]; error: null }>>();
  const mockFrom = vi.fn((_table: string) => {
    const chain = {
      select: () => chain,
      ilike: (_col: string, pattern: string) => {
        lastQuery = pattern.replace(/%$/, '');
        return chain;
      },
      order: () => chain,
      limit: () => mockLimit(),
    };
    return chain;
  });
  return { mockLimit, mockFrom, getLastQuery: () => lastQuery };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

import { CityCountryAutocomplete } from '../create/CityCountryAutocomplete';

const zurich: CityRow = {
  id: 'city-zurich',
  name: 'Zürich',
  timezone: 'Europe/Zurich',
  country: { id: 'country-ch', name: 'Switzerland', code: 'CH' },
};

const berlin: CityRow = {
  id: 'city-berlin',
  name: 'Berlin',
  timezone: 'Europe/Berlin',
  country: { id: 'country-de', name: 'Germany', code: 'DE' },
};

const bern: CityRow = {
  id: 'city-bern',
  name: 'Bern',
  timezone: 'Europe/Zurich',
  country: { id: 'country-ch', name: 'Switzerland', code: 'CH' },
};

describe('CityCountryAutocomplete', () => {
  beforeEach(() => {
    mockLimit.mockReset();
    mockFrom.mockClear();
    mockLimit.mockResolvedValue({ data: [berlin, bern], error: null });
  });

  it('renders the text field with the provided label', () => {
    renderWithProviders(
      <CityCountryAutocomplete value={null} onChange={vi.fn()} label="Where to?" />,
    );
    expect(screen.getByLabelText(/Where to\?/)).toBeInTheDocument();
  });

  it('filters on the first keystroke after autofocus', async () => {
    renderWithProviders(
      <CityCountryAutocomplete
        value={null}
        onChange={vi.fn()}
        label="city"
        autoFocus
      />,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: 'Be' } });

    await waitFor(() => expect(mockLimit).toHaveBeenCalled(), { timeout: 3000 });
    expect(getLastQuery()).toBe('Be');
    expect(await screen.findByText('Berlin', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('fires onChange with a GeoSelection when an option is picked', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <CityCountryAutocomplete value={null} onChange={onChange} label="city" />,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ber' } });

    const option = await screen.findByText('Berlin', {}, { timeout: 3000 });
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

  it('queries supabase with the typed text (accent-folding handled by the DB)', async () => {
    mockLimit.mockResolvedValue({ data: [zurich], error: null });
    renderWithProviders(
      <CityCountryAutocomplete value={null} onChange={vi.fn()} label="city" />,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Zurich' } });

    await waitFor(() => expect(mockLimit).toHaveBeenCalled(), { timeout: 3000 });
    expect(getLastQuery()).toBe('Zurich');
    expect(await screen.findByText('Zürich', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('also queries for the accented form', async () => {
    mockLimit.mockResolvedValue({ data: [zurich], error: null });
    renderWithProviders(
      <CityCountryAutocomplete value={null} onChange={vi.fn()} label="city" />,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Zürich' } });

    await waitFor(() => expect(mockLimit).toHaveBeenCalled(), { timeout: 3000 });
    expect(getLastQuery()).toBe('Zürich');
    expect(await screen.findByText('Zürich', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('closes the listbox on Escape', async () => {
    renderWithProviders(
      <CityCountryAutocomplete value={null} onChange={vi.fn()} label="city" />,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ber' } });
    await screen.findByText('Berlin', {}, { timeout: 3000 });
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
    });
  });

  it('closes the listbox on an outside click (no blur-timer race)', async () => {
    renderWithProviders(
      <div>
        <button type="button">outside</button>
        <CityCountryAutocomplete value={null} onChange={vi.fn()} label="city" />
      </div>,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Ber' } });
    await screen.findByText('Berlin', {}, { timeout: 3000 });

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true }),
      );
    });

    await waitFor(() =>
      expect(screen.queryByText('Berlin')).not.toBeInTheDocument(),
    );
  });

  it('supports keyboard-only selection', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <CityCountryAutocomplete value={null} onChange={onChange} label="city" />,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Be' } });
    await screen.findByText('Berlin', {}, { timeout: 3000 });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ cityId: 'city-bern' }),
    );
  });

  it('does not search when normalized query is shorter than 2 characters', async () => {
    renderWithProviders(
      <CityCountryAutocomplete value={null} onChange={vi.fn()} label="city" />,
    );
    const input = screen.getByLabelText('city') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  B  ' } });
    await new Promise((r) => setTimeout(r, 400));
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

    const cta = await screen.findByText(
      /trips\.dialog\.create\.addNewPlace/,
      {},
      { timeout: 3000 },
    );
    fireEvent.click(cta);
    expect(onFallback).toHaveBeenCalledWith('Nowhereville');
  });
});
