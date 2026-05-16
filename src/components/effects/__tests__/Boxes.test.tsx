/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Boxes } from '../Boxes';

describe('Boxes', () => {
  it('renders', () => {
    const { container } = render(<Boxes  />);
    expect(container).toBeTruthy();
  });
});
