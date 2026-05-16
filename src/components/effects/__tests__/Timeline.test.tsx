/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Timeline } from '../Timeline';

describe('Timeline', () => {
  it('renders empty', () => {
    const { container } = render(<Timeline data={[]} />);
    expect(container).toBeTruthy();
  });
});
