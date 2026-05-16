/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AirportAutocomplete } from '../AirportAutocomplete';

describe('AirportAutocomplete', () => {
  it('renders', () => {
    const { container } = render(<AirportAutocomplete value="" onChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
