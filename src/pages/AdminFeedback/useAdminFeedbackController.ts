import { useCallback, useRef, useState } from 'react';
import { useFeedbackUrlState } from '@/hooks/useFeedbackUrlState';
import { useFeedbackShortcuts } from '@/hooks/useFeedbackShortcuts';
import { kanbanColumns } from '@/components/admin/feedback/constants';
import { formatClaudePrompt } from '@/components/admin/feedback/claudePrompts';
import type { FeedbackSubmission } from '@/components/admin/feedback/types';
import {
  useStories,
  useStory,
  useSubmissionStoryMap,
  useStorySuggestions,
  useCreateStory,
  useAddStoryMembers,
  useRemoveStoryMembers,
  useUpdateStory,
  useResolveStory,
  useAcceptStorySuggestion,
  useDismissStorySuggestion,
  useSuggestStoryFromIds,
  useGroupedStories,
  useCascadeStoryToMembers,
  useStoryDivergence,
  useSetStoryNarrative,
  useRenarrateStory,
} from '@/hooks/useFeedbackStories';
import { useFeedbackData } from './useFeedbackData';
import { useFeedbackMutations } from './useFeedbackMutations';
import { useFeedbackSelection } from './useFeedbackSelection';

export function useAdminFeedbackController() {
  const { state, update, clearFilters, activeFilterCount } = useFeedbackUrlState();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const drawerOpen = !!state.sel;

  const data = useFeedbackData(state);
  const mutations = useFeedbackMutations(data.items);
  const selection = useFeedbackSelection(data.grouped, data.filteredItems);

  // Stories
  const { data: stories = [] } = useStories();
  const groupedStories = useGroupedStories(stories);
  const { data: storySuggestions = [] } = useStorySuggestions();
  const { data: submissionStoryMap = {} } = useSubmissionStoryMap();
  const { data: activeStoryBundle } = useStory(state.story);
  const createStory = useCreateStory();
  const addStoryMembers = useAddStoryMembers();
  const removeStoryMembers = useRemoveStoryMembers();
  const updateStory = useUpdateStory();
  const resolveStory = useResolveStory();
  const cascadeToMembers = useCascadeStoryToMembers();
  const setStoryNarrative = useSetStoryNarrative();
  const renarrateStory = useRenarrateStory();
  const { data: storyDivergence } = useStoryDivergence(state.story);
  const acceptStorySuggestion = useAcceptStorySuggestion();
  const dismissStorySuggestion = useDismissStorySuggestion();
  const suggestStoryFromIds = useSuggestStoryFromIds();

  const handleCopyPrompt = useCallback(
    async (item: FeedbackSubmission) => {
      try {
        await navigator.clipboard.writeText(formatClaudePrompt(item));
        mutations.toast({ title: 'Prompt copied', description: 'Paste into Claude Code' });
      } catch {
        mutations.toast({
          title: 'Copy failed',
          description: 'Clipboard unavailable',
          variant: 'destructive',
        });
      }
    },
    [mutations],
  );

  const handleCreateStoryFromSelection = useCallback(
    (title: string) => {
      const ids = Array.from(selection.selectedIds);
      if (ids.length === 0) return;
      createStory.mutate(
        { title, submissionIds: ids },
        {
          onSuccess: (storyId) => {
            mutations.toast({ title: 'Story created', description: `${ids.length} items bundled` });
            selection.clearSelection();
            update({ tab: 'stories', story: storyId });
          },
          onError: (e: Error) =>
            mutations.toast({ title: 'Create story failed', description: e.message, variant: 'destructive' }),
        },
      );
    },
    [selection, createStory, mutations, update],
  );

  const handleAddSelectionToStory = useCallback(
    (storyId: string) => {
      const ids = Array.from(selection.selectedIds);
      if (ids.length === 0) return;
      addStoryMembers.mutate(
        { storyId, submissionIds: ids },
        {
          onSuccess: () => {
            mutations.toast({ title: 'Added to story', description: `${ids.length} item(s)` });
            selection.clearSelection();
          },
          onError: (e: Error) =>
            mutations.toast({ title: 'Add to story failed', description: e.message, variant: 'destructive' }),
        },
      );
    },
    [selection, addStoryMembers, mutations],
  );

  useFeedbackShortcuts(!data.isLoading, {
    onFocusSearch: () => searchInputRef.current?.focus(),
    onOpenPalette: () => setPaletteOpen(true),
    onOpenHelp: () => setHelpOpen(true),
    onEscape: () => {
      if (selection.selectedIds.size > 0) selection.clearSelection();
      else if (drawerOpen) update({ sel: null });
    },
    onMoveCard: selection.moveFocus,
    onOpenFocused: () => {
      if (selection.focusedId) update({ sel: selection.focusedId });
    },
    onSetStatusIndex: (i) => {
      const status = kanbanColumns[i]?.id;
      if (status && selection.actionTargetIds.length) {
        mutations.statusMutation.mutate({ ids: selection.actionTargetIds, status });
      }
    },
    onSetPriority: (priority) => {
      if (selection.actionTargetIds.length)
        mutations.priorityMutation.mutate({ ids: selection.actionTargetIds, priority });
    },
    onAssignPicker: () => setPaletteOpen(true),
    onForwardFocused: () => {
      if (selection.focusedId) mutations.forwardMutation.mutate(selection.focusedId);
    },
    onCopyHandoff: () => {
      if (!selection.focusedId) return;
      const item = data.items.find((i) => i.id === selection.focusedId);
      if (!item) return;
      const prompt = formatClaudePrompt(item);
      navigator.clipboard.writeText(prompt).catch(() => {});
      mutations.recordHandoff.mutate({
        submissionId: selection.focusedId,
        target: 'claude-code',
        promptPreview: prompt.slice(0, 160),
      });
      mutations.toast({ title: 'Prompt copied + handoff recorded' });
    },
    onToggleSelectFocused: (shift) => {
      if (selection.focusedId) selection.toggleSelect(selection.focusedId, shift);
    },
  });

  return {
    user: data.user,
    toast: mutations.toast,
    queryClient: mutations.queryClient,

    state,
    update,
    clearFilters,
    activeFilterCount,
    searchInputRef,

    paletteOpen,
    setPaletteOpen,
    helpOpen,
    setHelpOpen,
    selectedIds: selection.selectedIds,
    focusedId: selection.focusedId,
    setFocusedId: selection.setFocusedId,
    setFocusedColumnIdx: selection.setFocusedColumnIdx,
    forwardingIds: mutations.forwardingIds,
    drawerOpen,
    sessionStartIso: data.sessionStartIso,
    seenIds: data.seenIds,
    setSeenIds: data.setSeenIds,

    items: data.items,
    apiErrors: data.apiErrors,
    isLoading: data.isLoading,
    errorsLoading: data.errorsLoading,
    admins: data.admins,
    adminMap: data.adminMap,
    votesMap: data.votesMap,
    selected: data.selected,
    watchersByItem: data.watchersByItem,
    availableLabels: data.availableLabels,
    itemsById: data.itemsById,
    feedbackById: data.feedbackById,
    errorsById: data.errorsById,

    duplicateMap: data.duplicateMap,
    dismissSuggestion: data.dismissSuggestion,
    mergeDuplicate: data.mergeDuplicate,
    auditEntries: data.auditEntries,
    replyMutation: mutations.replyMutation,
    recordHandoff: mutations.recordHandoff,
    updateHandoff: mutations.updateHandoff,

    stories,
    groupedStories,
    storySuggestions,
    submissionStoryMap,
    activeStoryBundle,
    updateStory,
    resolveStory,
    removeStoryMembers,
    cascadeToMembers,
    setStoryNarrative,
    renarrateStory,
    storyDivergence,
    acceptStorySuggestion,
    dismissStorySuggestion,
    suggestStoryFromIds,

    spamCount: data.spamCount,
    grouped: data.grouped,
    totalVisibleCount: data.totalVisibleCount,
    actionTargetIds: selection.actionTargetIds,

    statusMutation: mutations.statusMutation,
    priorityMutation: mutations.priorityMutation,
    assignMutation: mutations.assignMutation,
    labelsMutation: mutations.labelsMutation,
    resolutionMutation: mutations.resolutionMutation,
    notesMutation: mutations.notesMutation,
    forwardMutation: mutations.forwardMutation,

    toggleSelect: selection.toggleSelect,
    clearSelection: selection.clearSelection,
    selectAllVisible: selection.selectAllVisible,

    handleCopyPrompt,
    handleCreateStoryFromSelection,
    handleAddSelectionToStory,
  };
}

export type AdminFeedbackController = ReturnType<typeof useAdminFeedbackController>;
