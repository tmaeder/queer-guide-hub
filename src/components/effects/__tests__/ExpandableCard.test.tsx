/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ExpandableCard } from '../ExpandableCard';

describe('ExpandableCard', () => {
  it('renders empty', () => {
    const { container } = render(<ExpandableCard items={[]} />);
    expect(container).toBeTruthy();
  });
});
