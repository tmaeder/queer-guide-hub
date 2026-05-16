/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WobbleCard } from '../WobbleCard';

describe('WobbleCard', () => {
  it('renders', () => {
    const { container } = render(<WobbleCard><div>x</div></WobbleCard>);
    expect(container).toBeTruthy();
  });
});
