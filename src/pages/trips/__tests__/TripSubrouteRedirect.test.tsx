/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import TripSubrouteRedirect from '../TripSubrouteRedirect';

describe('TripSubrouteRedirect', () => {
  it('renders', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/trips/abc/sub']}>
        <Routes>
          <Route path="/trips/:id/*" element={<TripSubrouteRedirect view="overview" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
