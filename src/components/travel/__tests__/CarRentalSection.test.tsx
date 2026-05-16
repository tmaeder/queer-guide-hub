/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { CarRentalSection } from '../CarRentalSection';

describe('CarRentalSection', () => {
  it('renders', () => {
    const { container } = render(<CarRentalSection city="Berlin" />);
    expect(container).toBeTruthy();
  });
});
