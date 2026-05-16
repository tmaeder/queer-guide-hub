/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Meteors } from '../Meteors';

describe('Meteors', () => {
  it('renders', () => {
    const { container } = render(<Meteors  />);
    expect(container).toBeTruthy();
  });
});
