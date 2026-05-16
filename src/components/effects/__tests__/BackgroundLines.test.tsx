/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BackgroundLines } from '../BackgroundLines';

describe('BackgroundLines', () => {
  it('renders', () => {
    const { container } = render(<BackgroundLines  />);
    expect(container).toBeTruthy();
  });
});
