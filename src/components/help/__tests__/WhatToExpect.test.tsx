/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WhatToExpect } from '../WhatToExpect';

describe('WhatToExpect', () => {
  it('renders', () => {
    const { container } = render(<WhatToExpect />);
    expect(container).toBeTruthy();
  });
});
