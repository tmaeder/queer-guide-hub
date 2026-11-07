/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../tabs/DataOperationsTab', () => ({ default: () => <div data-testid="inventory" /> }));
vi.mock('../tabs/OverviewTab', () => ({ default: () => <div data-testid="overview" /> }));
vi.mock('../PipelineBuilder', () => ({ default: () => <div data-testid="builder" /> }));
vi.mock('../tabs/MonitorTab', () => ({ default: () => <div data-testid="monitor" /> }));
vi.mock('../tabs/HealthTab', () => ({ default: () => null }));
vi.mock('../tabs/NewsTab', () => ({ default: () => null }));
vi.mock('../tabs/DLQTab', () => ({ default: () => null }));
vi.mock('../tabs/CoverageTab', () => ({ default: () => null }));
vi.mock('../tabs/SourcesTab', () => ({ default: () => null }));
vi.mock('../tabs/ErrorsTab', () => ({ default: () => null }));
vi.mock('../tabs/AlertsTab', () => ({ default: () => null }));
vi.mock('../tabs/ScraperHealthTab', () => ({ default: () => null }));
vi.mock('../tabs/AuditTab', () => ({ default: () => null }));
vi.mock('../tabs/IntegrationsTab', () => ({ default: () => null }));
vi.mock('../tabs/BackfillsTab', () => ({ default: () => null }));

vi.mock('../tabs/ManualImportsTab', () => ({
  default: () => <div data-testid="manual-imports" />,
}));
vi.mock('@/components/admin/EmailIngestionsManager', () => ({
  EmailIngestionsManager: () => <div data-testid="email-history" />,
}));

import UnifiedDataOps from '../UnifiedDataOps';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/pipelines" element={<UnifiedDataOps />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('UnifiedDataOps', () => {
  it.each([
    ['imports', 'Manual imports', 'manual-imports'],
    ['email', 'Email history', 'email-history'],
  ])('deep links to Sources / %s', async (sub, label, testId) => {
    renderAt(`/admin/pipelines?tab=sources&sub=${sub}`);
    expect(screen.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByTestId(testId)).toBeInTheDocument());
  });

  it('switches between manual imports and email history', async () => {
    renderAt('/admin/pipelines?tab=sources&sub=imports');
    await screen.findByTestId('manual-imports');
    fireEvent.click(screen.getByRole('tab', { name: 'Email history' }));
    await screen.findByTestId('email-history');
    expect(screen.queryByTestId('manual-imports')).not.toBeInTheDocument();
  });
  it('renders the slimmed tab bar', () => {
    renderAt('/admin/pipelines');
    for (const name of ['Overview', 'Builder', 'Monitoring', 'Sources', 'News', 'Audit']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    // Removed tabs are gone from the top bar.
    expect(screen.queryByRole('tab', { name: /Dedup/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Geo/ })).not.toBeInTheDocument();
  });

  it('legacy ?tab=monitor lands on Monitoring with the Runs sub-section active', () => {
    renderAt('/admin/pipelines?tab=monitor');
    expect(screen.getByRole('tab', { name: 'Monitoring' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Runs' })).toHaveAttribute('aria-selected', 'true');
  });

  it('legacy ?tab=integrations lands on Sources with the Integrations sub-section active', () => {
    renderAt('/admin/pipelines?tab=integrations');
    expect(screen.getByRole('tab', { name: 'Sources' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Integrations' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('legacy dedup deep links land on the overview', () => {
    renderAt('/admin/pipelines?tab=dedup');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens the inventory by default and keeps the definitions accessible', async () => {
    renderAt('/admin/pipelines');
    await screen.findByTestId('inventory');
    fireEvent.click(screen.getByRole('tab', { name: 'Pipeline and workflow definitions' }));
    await screen.findByTestId('overview');
  });

  it('opens the builder for an existing pipeline deep link', async () => {
    renderAt('/admin/pipelines?pipeline=news-ingestion');
    expect(screen.getByRole('tab', { name: 'Builder' })).toHaveAttribute('aria-selected', 'true');
    await screen.findByTestId('builder');
  });

  it('clicking tab switches content', () => {
    renderAt('/admin/pipelines');
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    expect(screen.getByRole('tab', { name: 'Builder' })).toHaveAttribute('aria-selected', 'true');
  });
});
