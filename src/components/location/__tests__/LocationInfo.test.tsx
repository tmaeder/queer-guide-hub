/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { LocationInfo } from '../LocationInfo';

describe('LocationInfo', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><LocationInfo name="Berlin" type="city" /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
