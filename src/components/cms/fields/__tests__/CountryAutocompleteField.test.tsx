import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CountryAutocompleteField } from '../CountryAutocompleteField';

vi.mock('@/components/ui/country-autocomplete', () => ({
  CountryAutocomplete: ({
    onCountrySelect,
  }: {
    onCountrySelect?: (c: { id: string; name: string; code: string } | null) => void;
  }) => (
    <div>
      <button type="button" data-testid="pick-fr" onClick={() => onCountrySelect?.({ id: 'fr', name: 'France', code: 'FR' })}>
        pick-fr
      </button>
      <button type="button" data-testid="pick-de" onClick={() => onCountrySelect?.({ id: 'de', name: 'Germany', code: 'DE' })}>
        pick-de
      </button>
      <button type="button" data-testid="pick-null" onClick={() => onCountrySelect?.(null)}>
        pick-null
      </button>
    </div>
  ),
}));

const baseField = {
  name: 'country',
  label: 'Country',
  type: 'country-autocomplete',
  relatedFields: { country_id: 'country_id', city: 'city', city_id: 'city_id' },
} as unknown as Parameters<typeof CountryAutocompleteField>[0]['field'];

function setup() {
  const setFields = vi.fn();
  const onChange = vi.fn();
  const utils = render(
    <CountryAutocompleteField
      field={baseField}
      value=""
      onChange={onChange}
      setFields={setFields}
    />,
  );
  return { setFields, onChange, ...utils };
}

describe('CountryAutocompleteField', () => {
  it('does NOT clear city on null selection (blur/open)', () => {
    const { setFields, getByTestId } = setup();
    fireEvent.click(getByTestId('pick-null'));
    for (const call of setFields.mock.calls) {
      expect(call[0].city).toBeUndefined();
    }
  });

  it('does NOT clear city when same country re-selected', () => {
    const { setFields, getByTestId } = setup();
    fireEvent.click(getByTestId('pick-fr'));
    setFields.mockClear();
    fireEvent.click(getByTestId('pick-fr'));
    for (const call of setFields.mock.calls) {
      expect(call[0].city).toBeUndefined();
      expect(call[0].city_id).toBeUndefined();
    }
  });

  it('DOES clear city when a different country is selected', () => {
    const { setFields, getByTestId } = setup();
    fireEvent.click(getByTestId('pick-fr'));
    setFields.mockClear();
    fireEvent.click(getByTestId('pick-de'));
    const last = setFields.mock.calls.at(-1)?.[0];
    expect(last.country_id).toBe('de');
    expect(last.city).toBe('');
    expect(last.city_id).toBeNull();
  });
});
