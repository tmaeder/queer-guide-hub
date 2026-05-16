/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GlowingEffect } from '../GlowingEffect';

describe('GlowingEffect', () => {
  it('renders', () => {
    const { container } = render(<GlowingEffect />);
    expect(container).toBeTruthy();
  });
});
