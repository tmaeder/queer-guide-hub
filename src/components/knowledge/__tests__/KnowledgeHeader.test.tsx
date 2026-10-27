import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { KnowledgeHeader } from '../KnowledgeHeader';

function HistoryControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current URL">{location.pathname + location.search}</output>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:locale?/tags" element={<KnowledgeHeader section="terms" />} />
        <Route
          path="/:locale?/personalities"
          element={<KnowledgeHeader section="personalities" />}
        />
        <Route path="/:locale?/history" element={<KnowledgeHeader section="history" />} />
      </Routes>
      <HistoryControls />
    </MemoryRouter>,
  );
}

describe('Knowledge section navigation', () => {
  it('switches sections and restores the filtered URL through browser history', () => {
    renderAt('/tags?q=drag&view=list');
    const nav = screen.getByRole('navigation', { name: 'Knowledge sections' });
    expect(within(nav).getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(within(nav).getByRole('link', { name: 'Personalities' }));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/personalities');
    expect(screen.getByRole('link', { name: 'Personalities' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Terms' })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/tags?q=drag&view=list');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Knowledge');
  });

  it('includes the history timeline as a section', () => {
    renderAt('/tags');
    fireEvent.click(screen.getByRole('link', { name: 'History' }));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/history');
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Terms' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the locale when moving between the directories', () => {
    renderAt('/de/personalities?era=stonewall');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/de/tags');
    fireEvent.click(screen.getByRole('link', { name: 'Terms' }));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/de/tags');
    expect(screen.getByRole('link', { name: 'Personalities' })).toHaveAttribute(
      'href',
      '/de/personalities',
    );
  });
});
