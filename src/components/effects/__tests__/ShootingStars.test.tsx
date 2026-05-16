/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ShootingStars } from '../ShootingStars';

describe('ShootingStars', () => {
  it('renders', () => {
    const { container } = render(<ShootingStars />);
    expect(container).toBeTruthy();
  });
});
