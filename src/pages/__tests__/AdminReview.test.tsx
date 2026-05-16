/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const triageSpy = vi.fn();
vi.mock('@/components/admin/triage/TriageView', () => ({
  TriageView: (p: { initialQueueType?: string }) => {
    triageSpy(p);
    return <div data-testid="triage">{p.initialQueueType ?? 'none'}</div>;
  },
}));

import AdminReview from '../AdminReview';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/admin/review" element={<AdminReview />} /></Routes>
    </MemoryRouter>,
  );
}

describe('AdminReview', () => {
  it('renders TriageView without queue when no params', () => {
    renderAt('/admin/review');
    expect(screen.getByTestId('triage')).toHaveTextContent('none');
  });

  it('maps tab=staging to staging queue', () => {
    renderAt('/admin/review?tab=staging');
    expect(screen.getByTestId('triage')).toHaveTextContent('staging');
  });

  it('queue param overrides tab', () => {
    renderAt('/admin/review?tab=staging&queue=duplicates');
    expect(screen.getByTestId('triage')).toHaveTextContent('duplicates');
  });
});
