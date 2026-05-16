/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { VenueCombobox } from '../venue-combobox';

describe('VenueCombobox', () => {
  it('renders', () => {
    const { container } = render(<VenueCombobox venues={[]} value="" onValueChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
