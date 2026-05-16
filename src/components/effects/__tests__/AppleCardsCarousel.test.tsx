/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AppleCardsCarousel } from '../AppleCardsCarousel';

describe('AppleCardsCarousel', () => {
  it('renders empty', () => {
    const { container } = render(<AppleCardsCarousel items={[]} />);
    expect(container).toBeTruthy();
  });
});
