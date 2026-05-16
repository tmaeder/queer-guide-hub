/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { HotelSearchForm } from '../HotelSearchForm';

describe('HotelSearchForm', () => {
  it('renders', () => {
    const { container } = render(<HotelSearchForm onSearch={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
