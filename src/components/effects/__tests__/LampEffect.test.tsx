/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LampEffect } from '../LampEffect';

describe('LampEffect', () => {
  it('renders', () => {
    const { container } = render(<LampEffect>x</LampEffect>);
    expect(container).toBeTruthy();
  });
});
