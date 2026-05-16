/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } } }));

import CountryWeatherForecast from '../CountryWeatherForecast';

describe('CountryWeatherForecast', () => {
  it('renders', () => {
    const { container } = render(<CountryWeatherForecast latitude={52} longitude={13} countryName="Germany" capital="Berlin" />);
    expect(container).toBeTruthy();
  });
});
