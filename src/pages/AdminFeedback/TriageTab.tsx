import type { Dispatch, RefObject, SetStateAction } from 'react';
import { FeedbackKanban } from '@/components/admin/feedback/FeedbackKanban';
import { FeedbackFilters } from '@/components/admin/feedback/FeedbackFilters';
import { FeedbackPresets } from '@/components/admin/feedback/FeedbackPresets';
import { FeedbackBulkBar } from '@/components/admin/feedback/FeedbackBulkBar';
import {
  kanbanColumns,
  type KanbanStatus,
} from '@/components/admin/feedback/constants';
import type {
  AdminProfile,
  FeedbackSubmission,
  StoryWithCounts,
  SubmissionStoryRef,
} from '@/components/admin/feedback/types';
import type { useFeedbackUrlState } from '@/hooks/useFeedbackUrlState';

type UrlState = ReturnType<typeof useFeedbackUrlState>;

interface TriageTabProps {
  state: UrlState['state'];
  update: UrlState['update'];
  clearFilters: UrlState['clearFilters'];
  activeFilterCount: number;
  currentUserId: string | null;
  admins: AdminProfile[];
  availableLabels: string[];
  searchInputRef: RefObject<HTMLInputElement>;

  grouped: Record<KanbanStatus, FeedbackSubmission[]>;
  totalVisibleCount: number;
  voteCounts: Record<string, { count: number }>;
  selectedIds: Set<string>;
  focusedId: string | null;
  watchersByItem: Record<string, AdminProfile[]>;
  adminMap: Record<string, AdminProfile>;
  submissionStoryMap: Record<string, SubmissionStoryRef>;
  sessionStartIso: string;
  seenIds: Set<string>;
  setSeenIds: Dispatch<SetStateAction<Set<string>>>;
  setFocusedId: Dispatch<SetStateAction<string | null>>;
  setFocusedColumnIdx: Dispatch<SetStateAction<number>>;
  toggleSelect: (id: string, shift: boolean) => void;
  selectAllVisible: () => void;
  clearSelection: () => void;
  items: FeedbackSubmission[];
  stories: StoryWithCounts[];

  onSetStatus: (ids: string[], status: KanbanStatus) => void;
  onSetPriority: (ids: string[], priority: number) => void;
  onAssign: (ids: string[], assigneeId: string | null) => void;
  onSetLabels: (id: string, labels: string[]) => void;
  onForward: (id: string) => void;
  onCreateStoryFromSelection: (title: string) => void;
  onAddSelectionToStory: (storyId: string) => void;
  onAutoTitle: () => Promise<string | null>;
  mutationsLoading: boolean;
}

export function TriageTab({
  state,
  update,
  clearFilters,
  activeFilterCount,
  currentUserId,
  admins,
  availableLabels,
  searchInputRef,
  grouped,
  totalVisibleCount,
  voteCounts,
  selectedIds,
  focusedId,
  watchersByItem,
  adminMap,
  submissionStoryMap,
  sessionStartIso,
  seenIds,
  setSeenIds,
  setFocusedId,
  setFocusedColumnIdx,
  toggleSelect,
  selectAllVisible,
  clearSelection,
  items,
  stories,
  onSetStatus,
  onSetPriority,
  onAssign,
  onSetLabels,
  onForward,
  onCreateStoryFromSelection,
  onAddSelectionToStory,
  onAutoTitle,
  mutationsLoading,
}: TriageTabProps) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <FeedbackPresets
          state={state}
          update={update}
          clearFilters={clearFilters}
          currentUserId={currentUserId}
        />
        <div className="flex-1" />
        <FeedbackFilters
          state={state}
          update={update}
          clearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          admins={admins}
          labels={availableLabels}
          searchInputRef={searchInputRef}
        />
      </div>

      {totalVisibleCount === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          {activeFilterCount > 0
            ? 'No submissions match the current filters.'
            : 'No submissions yet.'}
        </p>
      ) : (
        <FeedbackKanban
          grouped={grouped}
          voteCounts={voteCounts}
          selectedIds={selectedIds}
          focusedId={focusedId}
          watchersByItem={watchersByItem}
          adminById={adminMap}
          storyByItem={submissionStoryMap}
          onStoryClick={(storyId) => update({ tab: 'stories', story: storyId })}
          isNew={(id, submittedAt) =>
            submittedAt > sessionStartIso && !seenIds.has(id)
          }
          onCardClick={(item) => {
            setFocusedId(item.id);
            const colIdx = kanbanColumns.findIndex(
              (c) => c.id === (item.feedback_status as KanbanStatus),
            );
            if (colIdx >= 0) setFocusedColumnIdx(colIdx);
            setSeenIds((prev) => {
              if (prev.has(item.id)) return prev;
              const next = new Set(prev);
              next.add(item.id);
              return next;
            });
            update({ sel: item.id });
          }}
          onToggleSelect={toggleSelect}
          onStatusDrop={(id, status) => onSetStatus([id], status)}
        />
      )}

      <FeedbackBulkBar
        selectedCount={selectedIds.size}
        totalCount={totalVisibleCount}
        onSelectAll={selectAllVisible}
        onClear={clearSelection}
        onSetStatus={(status) => onSetStatus(Array.from(selectedIds), status)}
        onSetPriority={(priority) => onSetPriority(Array.from(selectedIds), priority)}
        onAssign={(assigneeId) => onAssign(Array.from(selectedIds), assigneeId)}
        onAddLabel={(label) => {
          for (const id of selectedIds) {
            const it = items.find((i) => i.id === id);
            if (!it) continue;
            const next = Array.from(new Set([...(it.labels ?? []), label]));
            onSetLabels(id, next);
          }
        }}
        onForward={() => {
          for (const id of selectedIds) onForward(id);
        }}
        onCreateStory={onCreateStoryFromSelection}
        onAddToStory={onAddSelectionToStory}
        onAutoTitle={onAutoTitle}
        stories={stories}
        admins={admins}
        loading={mutationsLoading}
      />
    </>
  );
}
