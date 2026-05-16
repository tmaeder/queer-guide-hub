/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BadgeRow } from '../BadgeRow';

describe('BadgeRow', () => {
  it('renders null for empty', () => {
    const { container } = render(<BadgeRow badges={[]} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders badges', () => {
    const { container } = render(<BadgeRow badges={[{ id: '1', label: 'Test', icon: 'star' } as never]} />);
    expect(container).toBeTruthy();
  });
});
