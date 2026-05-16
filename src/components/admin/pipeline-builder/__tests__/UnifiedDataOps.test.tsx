/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('@xyflow/react', () => ({ ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../tabs/OverviewTab', () => ({ default: () => <div data-testid="overview" /> }));
vi.mock('../PipelineBuilder', () => ({ default: () => <div data-testid="builder" /> }));
vi.mock('../tabs/MonitorTab', () => ({ default: () => <div data-testid="monitor" /> }));
vi.mock('../tabs/HealthTab', () => ({ default: () => null }));
vi.mock('../tabs/NewsTab', () => ({ default: () => null }));
vi.mock('../tabs/DLQTab', () => ({ default: () => null }));
vi.mock('../tabs/CoverageTab', () => ({ default: () => null }));
vi.mock('../tabs/GeoReviewTab', () => ({ default: () => null }));
vi.mock('../tabs/GeoMismatchTab', () => ({ default: () => null }));
vi.mock('../tabs/SourcesTab', () => ({ default: () => null }));
vi.mock('../tabs/ErrorsTab', () => ({ default: () => null }));
vi.mock('../tabs/AlertsTab', () => ({ default: () => null }));
vi.mock('../tabs/DedupDecisionsTab', () => ({ default: () => null }));
vi.mock('../tabs/ScraperHealthTab', () => ({ default: () => null }));
vi.mock('../tabs/AuditTab', () => ({ default: () => null }));
vi.mock('../tabs/IntegrationsTab', () => ({ default: () => null }));

import UnifiedDataOps from '../UnifiedDataOps';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/admin/pipelines" element={<UnifiedDataOps />} /></Routes>
    </MemoryRouter>,
  );
}

describe('UnifiedDataOps', () => {
  it('renders tab bar with all tabs', () => {
    renderAt('/admin/pipelines');
    expect(screen.getByRole('tab', { name: /Overview/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Builder/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Monitor/ })).toBeInTheDocument();
  });

  it('marks active tab aria-selected', () => {
    renderAt('/admin/pipelines?tab=monitor');
    expect(screen.getByRole('tab', { name: /Monitor/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking tab switches content', () => {
    renderAt('/admin/pipelines');
    fireEvent.click(screen.getByRole('tab', { name: /Builder/ }));
    expect(screen.getByRole('tab', { name: /Builder/ })).toHaveAttribute('aria-selected', 'true');
  });
});
