/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DirectoryCard } from '../DirectoryCard';

describe('DirectoryCard', () => {
  it('renders', () => {
    const { container } = render(<DirectoryCard type="city" name="Berlin" data={{} as never} onClick={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
