/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CardHoverEffect } from '../CardHoverEffect';

describe('CardHoverEffect', () => {
  it('renders empty', () => {
    const { container } = render(<CardHoverEffect items={[]} />);
    expect(container).toBeTruthy();
  });
});
