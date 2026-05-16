/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as brand from '../brand';

describe('brand icons', () => {
  it('Instagram renders', () => {
    const { container } = render(<brand.Instagram size={24} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
  it('Facebook renders', () => {
    const { container } = render(<brand.Facebook size={24} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
  it('exports many icons', () => {
    expect(Object.keys(brand).length).toBeGreaterThan(3);
  });
});
