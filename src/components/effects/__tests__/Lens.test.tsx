/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Lens } from '../Lens';

describe('Lens', () => {
  it('renders', () => {
    const { container } = render(<Lens><img alt="" /></Lens>);
    expect(container).toBeTruthy();
  });
});
