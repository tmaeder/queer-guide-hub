/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import TripSubrouteRedirect from '../TripSubrouteRedirect';

function Destination() {
  const { pathname, search } = useLocation();
  return <p>{pathname + search}</p>;
}

describe('TripSubrouteRedirect', () => {
  it('preserves locale and opens the intended preparation tool', async () => {
    render(
      <MemoryRouter initialEntries={['/de/trips/abc/packing']}>
        <Routes>
          <Route path="/:locale/trips/:tripId/*" element={<TripSubrouteRedirect view="plan" />} />
          <Route path="/:locale/trips/:tripId" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText('/de/trips/abc?view=plan&section=prepare&tool=packing'),
    ).toBeTruthy();
  });
});
