/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expectNoNestedInteractive } from '@/test/test-utils';
import { EntityCard } from '../EntityCard';

describe('EntityCard', () => {
  it('renders', () => {
    const { container } = render(
      <MemoryRouter><EntityCard href="/x" title="Title" /></MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('names the card-wide link after a string title', () => {
    const { container } = render(
      <MemoryRouter><EntityCard href="/x" title="Title" /></MemoryRouter>,
    );
    expect(container.querySelector('a')?.getAttribute('aria-label')).toBe('Title');
  });

  // The `actions` / `badges` / `children` slots take arbitrary nodes. They used
  // to render inside the card's wrapping <a>, so any interactive node a caller
  // passed became a `nested-interactive` violation (serious, WCAG 4.1.2). The
  // link is now an overlay sibling, which makes that structurally impossible.
  it('keeps interactive slot content out of the card link', () => {
    const { container } = render(
      <MemoryRouter>
        <EntityCard
          href="/x"
          title="Title"
          actions={<button type="button">Save</button>}
          badges={<a href="/tag">Tag</a>}
        >
          <button type="button">Add to trip</button>
        </EntityCard>
      </MemoryRouter>,
    );
    expectNoNestedInteractive(container);
  });
});
