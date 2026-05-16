/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { ContentListFilters } from '../ContentListFilters';

describe('ContentListFilters', () => {
  it('returns null when no filter fields', () => {
    const { container } = render(
      <ContentListFilters filterFields={[]} filters={{}} dynamicOptions={{}} setFilter={vi.fn()} clearFilters={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
