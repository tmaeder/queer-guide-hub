/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Separator } from '../separator';

describe('Separator', () => {
  it('renders horizontal default', () => {
    const { container } = render(<Separator />);
    expect(container.firstChild).toBeTruthy();
  });
  it('renders vertical', () => {
    const { container } = render(<Separator orientation="vertical" />);
    expect(container.firstChild).toBeTruthy();
  });
});
