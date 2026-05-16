/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { EntityCard } from '../EntityCard';

describe('EntityCard', () => {
  it('renders', () => {
    const { container } = render(
      <MemoryRouter><EntityCard href="/x" title="Title" /></MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
