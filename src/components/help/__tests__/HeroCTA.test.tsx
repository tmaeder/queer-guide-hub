/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HeroCTA } from '../HeroCTA';

describe('HeroCTA', () => {
  it('renders', () => {
    const { container } = render(<HeroCTA hotlines={[]} country="DE" />);
    expect(container).toBeTruthy();
  });
});
