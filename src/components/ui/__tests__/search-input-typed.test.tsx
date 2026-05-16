/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SearchInputTyped } from '../search-input-typed';

describe('SearchInputTyped', () => {
  it('renders', () => {
    const { container } = render(<SearchInputTyped placeholder="search" />);
    expect(container.querySelector('input')).toBeTruthy();
  });
});
