/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ReturnNudge } from '../ReturnNudge';

describe('ReturnNudge', () => {
  it('renders null when no new venues', () => {
    const { container } = render(<ReturnNudge nudge={{ city_id: 'c', city_name: 'Berlin', new_venues: 0 } as never} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders link when new venues', () => {
    const { container } = render(
      <MemoryRouter>
        <ReturnNudge nudge={{ city_id: 'c', city_name: 'Berlin', city_slug: 'berlin', visited_count: 2, last_visited_at: new Date().toISOString(), new_venues: 3 }} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
