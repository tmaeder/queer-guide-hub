/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DirectorySearch } from '../DirectorySearch';

describe('DirectorySearch', () => {
  it('renders', () => {
    const { container } = render(<DirectorySearch filters={{}} onFiltersChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
