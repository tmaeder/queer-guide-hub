/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('../pattern-library.css', () => ({}));

import PatternLibrary from '../index';

describe('PatternLibrary', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><PatternLibrary /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
