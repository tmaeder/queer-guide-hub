/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SpotlightEffect } from '../SpotlightEffect';

describe('SpotlightEffect', () => {
  it('renders', () => {
    const { container } = render(<SpotlightEffect children={<span>x</span>} />);
    expect(container).toBeTruthy();
  });
});
