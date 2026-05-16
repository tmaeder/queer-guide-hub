/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HoverBorderGradient } from '../HoverBorderGradient';

describe('HoverBorderGradient', () => {
  it('renders', () => {
    const { container } = render(<HoverBorderGradient>x</HoverBorderGradient>);
    expect(container).toBeTruthy();
  });
});
