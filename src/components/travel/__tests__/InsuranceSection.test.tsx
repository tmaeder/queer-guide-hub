/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { InsuranceSection } from '../InsuranceSection';

describe('InsuranceSection', () => {
  it('renders', () => {
    const { container } = render(<InsuranceSection />);
    expect(container).toBeTruthy();
  });
});
