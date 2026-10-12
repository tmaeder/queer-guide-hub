import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, it, expect } from 'vitest';
import AdminGovernance from '../AdminGovernance';
function Destination() {
  const location = useLocation();
  return <div>Unified queue{location.search}</div>;
}
describe('legacy governance bookmarks', () => {
  for (const [url, expected] of [
    ['/admin/governance?mode=engines', 'Unified queue'],
    ['/admin/governance?mode=tags', 'Unified queue?family=tags'],
    ['/admin/governance?mode=triage&queue=quality-city', 'Unified queue?queue=quality-city'],
  ]) {
    it(`redirects ${url} into the unified workspace`, () => {
      render(
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/admin/governance" element={<AdminGovernance />} />
            <Route path="/admin" element={<Destination />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  }
});
