/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender } from '@testing-library/react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
const render = (ui: React.ReactNode) =>
  rtlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <TooltipProvider>{ui}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

vi.mock('@/hooks/useVenueOrganisation', () => ({ useVenueOrganisation: () => ({ data: null }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useCMSWorkflow', () => ({
  useCMSWorkflow: () => ({
    metadata: null,
    loading: false,
    transition: vi.fn(),
    setReviewLevel: vi.fn(),
  }),
}));
vi.mock('@/hooks/useCMSMedia', () => ({
  useCMSMedia: () => ({
    getAttachments: vi.fn().mockResolvedValue([]),
    attachMedia: vi.fn(),
    detachMedia: vi.fn(),
  }),
}));
vi.mock('@/hooks/useContentRevisions', () => ({
  useContentRevisions: () => ({
    revisions: [],
    loading: false,
    load: vi.fn(),
    revertFields: vi.fn(),
  }),
  revisionDiffs: () => [],
}));
vi.mock('@/components/cms/media/MediaPickerDialog', () => ({ default: () => null }));
vi.mock('../EditorSidebar', () => ({ EditorSidebar: () => null }));
vi.mock('@/hooks/useCMSEditor', () => ({
  useCMSEditor: () => ({
    state: {
      data: {},
      originalData: {},
      isDirty: false,
      itemId: null,
      errors: {},
      isSaving: false,
      isLoading: false,
      activeGroup: 'basic',
    },
    setField: vi.fn(),
    setFields: vi.fn(),
    save: vi.fn(),
    reset: vi.fn(),
    refresh: vi.fn(),
    setActiveGroup: vi.fn(),
    updateMetadata: vi.fn(),
    contentType: null,
    loading: false,
    onChange: vi.fn(),
    onSave: vi.fn(),
    onReset: vi.fn(),
    metadata: null,
    onUpdateMetadata: vi.fn(),
  }),
}));

import { CMSEditorLayout } from '../CMSEditorLayout';

describe('CMSEditorLayout', () => {
  it('renders', () => {
    const { container } = render(
      <CMSEditorLayout contentType="venues" itemId={null} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
