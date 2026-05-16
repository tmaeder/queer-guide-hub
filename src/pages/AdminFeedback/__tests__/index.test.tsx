/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/usePageFetchers', () => ({ updateCommunitySubmission: vi.fn() }));

const mutationStub = () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(null) });

vi.mock('../useAdminFeedbackController', () => ({
  useAdminFeedbackController: () => ({
    user: { id: 'u1' }, queryClient: { invalidateQueries: vi.fn() }, toast: vi.fn(),
    state: {}, update: vi.fn(), clearFilters: vi.fn(), activeFilterCount: 0,
    admins: [], availableLabels: [], searchInputRef: createRef(),
    grouped: { open: [], triaged: [], in_progress: [], blocked: [], done: [], wont_fix: [] },
    totalVisibleCount: 0, votesMap: {}, selectedIds: new Set(), focusedId: null,
    watchersByItem: {}, adminMap: {}, submissionStoryMap: {}, sessionStartIso: '',
    seenIds: new Set(), setSeenIds: vi.fn(), setFocusedId: vi.fn(), setFocusedColumnIdx: vi.fn(),
    toggleSelect: vi.fn(), selectAllVisible: vi.fn(), clearSelection: vi.fn(),
    items: [], itemsById: {}, stories: [], groupedStories: { open: [], planned: [], in_progress: [], resolved: [], archived: [] }, storyDivergence: {}, storySuggestions: [],
    statusMutation: mutationStub(), priorityMutation: mutationStub(), assignMutation: mutationStub(),
    labelsMutation: mutationStub(), forwardMutation: mutationStub(), notesMutation: mutationStub(),
    resolutionMutation: mutationStub(), replyMutation: mutationStub(), recordHandoff: mutationStub(),
    updateHandoff: mutationStub(), renarrateStory: mutationStub(), updateStory: mutationStub(),
    removeStoryMembers: mutationStub(), resolveStory: mutationStub(), mergeDuplicate: mutationStub(),
    suggestStoryFromIds: mutationStub(), setStoryNarrative: mutationStub(),
    handleCopyPrompt: vi.fn(), handleCreateStoryFromSelection: vi.fn(), handleAddSelectionToStory: vi.fn(),
    acceptStorySuggestion: vi.fn(), dismissStorySuggestion: vi.fn(), dismissSuggestion: vi.fn(),
    forwardingIds: new Set(), drawerOpen: false, helpOpen: false, paletteOpen: false,
    setHelpOpen: vi.fn(), setPaletteOpen: vi.fn(),
    actionTargetIds: [], activeStoryBundle: null, auditEntries: [], cascadeToMembers: false,
    duplicateMap: {}, errorsById: {}, errorsLoading: false, feedbackById: {},
    isLoading: false, selected: null,
  }),
}));

import AdminFeedback from '../index';

describe('AdminFeedback', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<MemoryRouter><QueryClientProvider client={qc}><AdminFeedback /></QueryClientProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
