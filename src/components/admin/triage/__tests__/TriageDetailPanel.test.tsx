/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useEntityDataMock, useStagingDataMock } = vi.hoisted(() => ({
  useEntityDataMock: vi.fn(),
  useStagingDataMock: vi.fn(),
}));

vi.mock('@/hooks/useTriageDetail', () => ({
  useEntityData: useEntityDataMock,
  useStagingData: useStagingDataMock,
}));
vi.mock('../EntityPreviewCard', () => ({
  EntityPreviewCard: () => <div data-testid="entity-preview" />,
}));
vi.mock('../FieldDiffView', () => ({
  FieldDiffView: () => <div data-testid="diff" />,
  computeFieldDiffs: () => [],
}));
vi.mock('../ActionBar', () => ({
  ActionBar: () => <div data-testid="actions" />,
}));

import { TriageDetailPanel } from '../TriageDetailPanel';

const item = {
  id: 'i1', queue_type: 'staging', content_type: 'venues',
  title: 'Pride Bar', subtitle: 'sub line',
  confidence_score: 0.85,
  created_at: '2026-05-15T00:00:00Z',
  source: 'scraper',
  reporter_id: null,
  has_diff: false,
  meta: { city: 'Berlin' },
} as never;

beforeEach(() => {
  useEntityDataMock.mockReset();
  useStagingDataMock.mockReset();
});

describe('TriageDetailPanel', () => {
  it('renders header + actionbar + entity preview', () => {
    useEntityDataMock.mockReturnValue({ data: { name: 'X' }, isLoading: false });
    useStagingDataMock.mockReturnValue({ data: null });
    render(<TriageDetailPanel item={item} onAction={vi.fn()} isActionLoading={false} />);
    expect(screen.getByRole('heading', { name: 'Pride Bar' })).toBeInTheDocument();
    expect(screen.getByTestId('entity-preview')).toBeInTheDocument();
    expect(screen.getByTestId('actions')).toBeInTheDocument();
  });

  it('shows loading spinner while entity loads', () => {
    useEntityDataMock.mockReturnValue({ data: null, isLoading: true });
    useStagingDataMock.mockReturnValue({ data: null });
    const { container } = render(<TriageDetailPanel item={item} onAction={vi.fn()} isActionLoading={false} />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows confidence percentage', () => {
    useEntityDataMock.mockReturnValue({ data: null, isLoading: false });
    useStagingDataMock.mockReturnValue({ data: null });
    render(<TriageDetailPanel item={item} onAction={vi.fn()} isActionLoading={false} />);
    expect(screen.getByText(/Confidence: 85%/)).toBeInTheDocument();
  });

  it('renders meta entries under Context', () => {
    useEntityDataMock.mockReturnValue({ data: null, isLoading: false });
    useStagingDataMock.mockReturnValue({ data: null });
    render(<TriageDetailPanel item={item} onAction={vi.fn()} isActionLoading={false} />);
    expect(screen.getByText('Context')).toBeInTheDocument();
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
  });
});
