/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { MediaGrid } from '../MediaGrid';

describe('MediaGrid', () => {
  it('renders loading', () => {
    const { container } = render(
      <MemoryRouter>
        <MediaGrid loading items={[]} viewMode="grid" bulkMode={false} selectedItems={new Set()} onToggleSelect={vi.fn()} onStar={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
  it('renders empty list', () => {
    const { container } = render(
      <MemoryRouter>
        <MediaGrid loading={false} items={[]} viewMode="list" bulkMode={false} selectedItems={new Set()} onToggleSelect={vi.fn()} onStar={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
