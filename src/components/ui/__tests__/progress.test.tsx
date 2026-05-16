/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Progress } from '../progress';

describe('Progress', () => {
  it('renders', () => {
    const { container } = render(<Progress value={50} />);
    expect(container.querySelector('[role="progressbar"]')).toBeTruthy();
  });
});
