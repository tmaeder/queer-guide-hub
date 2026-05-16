/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Calendar } from '../calendar';

describe('Calendar', () => {
  it('renders', () => {
    const { container } = render(<Calendar />);
    expect(container).toBeTruthy();
  });
});
