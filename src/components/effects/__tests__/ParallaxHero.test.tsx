/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ParallaxHero } from '../ParallaxHero';

describe('ParallaxHero', () => {
  it('renders', () => {
    const { container } = render(<ParallaxHero imageUrl="https://x/img.jpg">body</ParallaxHero>);
    expect(container).toBeTruthy();
  });
});
