/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CityCompletionList } from '../CityCompletionList';

describe('CityCompletionList', () => {
  it('renders null when no qualifying rows', () => {
    const { container } = render(<CityCompletionList rows={[]} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders qualifying rows', () => {
    const { container } = render(
      <MemoryRouter>
        <CityCompletionList rows={[
          { city_id: 'c1', city_name: 'Berlin', city_slug: 'berlin', visited: 5, total_venues: 10 },
        ]} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
