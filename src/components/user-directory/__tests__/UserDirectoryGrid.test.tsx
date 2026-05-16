/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { UserDirectoryGrid } from '../UserDirectoryGrid';

describe('UserDirectoryGrid', () => {
  it('renders empty', () => {
    const { container } = render(
      <MemoryRouter>
        <UserDirectoryGrid profiles={[]} filters={{ interests: [] } as never} setFilters={vi.fn()} activeFiltersCount={0} isAuthed={false} clearAllFilters={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
