/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { TransferSection } from '../TransferSection';

describe('TransferSection', () => {
  it('renders', () => {
    const { container } = render(<TransferSection city="Berlin" equalityScore={0.9} airportCode="BER" />);
    expect(container).toBeTruthy();
  });
});
