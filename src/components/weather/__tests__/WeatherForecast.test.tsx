/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } } }));

import { WeatherForecast } from '../WeatherForecast';

describe('WeatherForecast', () => {
  it('renders', () => {
    const { container } = render(<WeatherForecast latitude={52} longitude={13} cityName="Berlin" />);
    expect(container).toBeTruthy();
  });
});
