/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Beams } from '../Beams';

describe('Beams', () => {
  it('renders', () => {
    const { container } = render(<Beams  />);
    expect(container).toBeTruthy();
  });
});
