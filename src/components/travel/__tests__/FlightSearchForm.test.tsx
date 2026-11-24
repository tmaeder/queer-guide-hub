import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
vi.mock('@/hooks/useVisitorOrigin', () => ({
  useVisitorOrigin: () => ({ originIata: 'ZRH', originCity: 'Zurich', loading: false }),
}));
vi.mock('@/hooks/useTravelDeals', () => ({
  useTravelDeals: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  })),
}));
vi.mock('../AirportAutocomplete', () => ({
  AirportAutocomplete: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (code: string, label: string) => void;
  }) => (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value, event.target.value)} />
    </label>
  ),
}));
import { FlightSearchForm } from '../FlightSearchForm';
import { useTravelDeals } from '@/hooks/useTravelDeals';
describe('FlightSearchForm', () => {
  it('submits the selected dates and keeps draft edits out of the active query', () => {
    const { getByLabelText, getByRole } = render(<FlightSearchForm initialDestination="BER" />);
    fireEvent.change(getByLabelText('Departure'), { target: { value: '2027-01-14' } });
    fireEvent.change(getByLabelText('Return (optional)'), { target: { value: '2027-01-20' } });
    fireEvent.submit(getByRole('button', { name: 'Search flights' }).closest('form')!);
    expect(useTravelDeals).toHaveBeenLastCalledWith(
      expect.objectContaining({
        origin: 'ZRH',
        destination: 'BER',
        departureDate: '2027-01-14',
        returnDate: '2027-01-20',
        enabled: true,
      }),
    );
    fireEvent.change(getByLabelText('Departure'), { target: { value: '2027-01-15' } });
    expect(useTravelDeals).toHaveBeenLastCalledWith(
      expect.objectContaining({ departureDate: '2027-01-14' }),
    );
    fireEvent.submit(getByRole('button', { name: 'Search flights' }).closest('form')!);
    expect(useTravelDeals).toHaveBeenLastCalledWith(
      expect.objectContaining({ departureDate: '2027-01-15' }),
    );
  });
  it('clears a return date made invalid by a new departure', () => {
    const { getByLabelText } = render(
      <FlightSearchForm initialDepartureDate="2027-01-14" initialReturnDate="2027-01-20" />,
    );
    fireEvent.change(getByLabelText('Departure'), { target: { value: '2027-01-21' } });
    expect(getByLabelText('Return (optional)')).toHaveValue('');
  });
});
