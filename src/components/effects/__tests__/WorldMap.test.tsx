/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WorldMap } from '../WorldMap';

describe('WorldMap', () => {
  it('renders', () => {
    const { container } = render(<WorldMap />);
    expect(container).toBeTruthy();
  });
});
