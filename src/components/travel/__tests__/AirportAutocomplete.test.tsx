import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import type { AirportRow } from '@/hooks/useAirportSearch';
vi.mock('@/hooks/useAirportSearch', () => ({
  searchAirports: vi.fn(),
  fetchAirportByIata: vi.fn(async () => null),
}));
import { searchAirports } from '@/hooks/useAirportSearch';
import { AirportAutocomplete } from '../AirportAutocomplete';
const london: AirportRow = {
  iata_code: 'LHR',
  name: 'Heathrow Airport',
  city_name: 'London',
  country_code: 'GB',
};
const paris: AirportRow = {
  iata_code: 'CDG',
  name: 'Charles de Gaulle Airport',
  city_name: 'Paris',
  country_code: 'FR',
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(searchAirports).mockReset();
  vi.mocked(searchAirports).mockResolvedValue([london]);
});
afterEach(() => vi.useRealTimers());
describe('AirportAutocomplete', () => {
  it('invalidates the selected code immediately when its label is edited', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <AirportAutocomplete
        value="ZRH"
        displayLabel="Zurich (ZRH)"
        onChange={onChange}
        label="From"
      />,
    );
    fireEvent.change(getByRole('combobox'), { target: { value: 'London' } });
    expect(onChange).toHaveBeenLastCalledWith('', 'London');
    expect(getByRole('combobox')).toHaveValue('London');
  });
  it('supports arrow navigation and Enter while keeping DOM focus on the combobox', async () => {
    const onChange = vi.fn();
    const { getByRole, queryByRole } = render(
      <AirportAutocomplete value="" onChange={onChange} label="From" />,
    );
    const input = getByRole('combobox');
    input.focus();
    fireEvent.change(input, { target: { value: 'London' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(getByRole('listbox')).toBeVisible();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', getByRole('option').id);
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('LHR', 'London (LHR)');
    expect(queryByRole('listbox')).toBeNull();
  });
  it('Escape dismisses choices without selecting an airport', async () => {
    const onChange = vi.fn();
    const { getByRole, queryByRole } = render(<AirportAutocomplete value="" onChange={onChange} />);
    const input = getByRole('combobox');
    fireEvent.change(input, { target: { value: 'London' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(queryByRole('listbox')).toBeNull();
    expect(input).toHaveValue('London');
    expect(onChange).not.toHaveBeenCalledWith('LHR', expect.anything());
  });
  it('ignores an older response and aborts its request when the query changes', async () => {
    let finishLondon!: (rows: AirportRow[]) => void;
    let finishParis!: (rows: AirportRow[]) => void;
    vi.mocked(searchAirports).mockImplementation(
      (query) =>
        new Promise((resolve) => {
          if (query === 'London') finishLondon = resolve;
          else finishParis = resolve;
        }),
    );
    const { getByRole, queryByRole } = render(<AirportAutocomplete value="" onChange={vi.fn()} />);
    fireEvent.change(getByRole('combobox'), { target: { value: 'London' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    const signal = vi.mocked(searchAirports).mock.calls[0][1]!;
    fireEvent.change(getByRole('combobox'), { target: { value: 'Paris' } });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      finishParis([paris]);
    });
    await act(async () => {
      finishLondon([london]);
    });
    expect(getByRole('option', { name: /Paris/ })).toBeVisible();
    expect(queryByRole('option', { name: /London/ })).toBeNull();
  });
  it('announces a failed lookup instead of claiming that no airports exist', async () => {
    vi.mocked(searchAirports).mockRejectedValue(new Error('offline'));
    const { getByRole } = render(<AirportAutocomplete value="" onChange={vi.fn()} />);
    fireEvent.change(getByRole('combobox'), { target: { value: 'London' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(getByRole('status')).toHaveTextContent('Airports could not be loaded');
  });
});
