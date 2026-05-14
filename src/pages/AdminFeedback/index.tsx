import { Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/PageHeader';
import { updateCommunitySubmission } from '@/hooks/usePageFetchers';
import { AnalyticsTab } from '@/components/admin/feedback/analytics/AnalyticsTab';
import { kanbanColumns, type KanbanStatus } from '@/components/admin/feedback/constants';
import { FeedbackCommandPalette } from '@/components/admin/feedback/FeedbackCommandPalette';
import { FeedbackDetailDrawer } from '@/components/admin/feedback/FeedbackDetailDrawer';
import { ShortcutHelpDialog } from '@/components/admin/feedback/ShortcutHelpDialog';
import { StoryDetailDrawer } from '@/components/admin/feedback/StoryDetailDrawer';
import type { StoryStatus } from '@/components/admin/feedback/types';
import { formatClaudePrompt } from '@/components/admin/feedback/claudePrompts';
import { TriageTab } from './TriageTab';
import { StoriesTab } from './StoriesTab';
import { useAdminFeedbackController } from './useAdminFeedbackController';

export default function AdminFeedback() {
  const c = useAdminFeedbackController();

  if (c.isLoading || c.errorsLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
      </div>
    );
  }

  const tabIdx =
    c.state.tab === 'triage' ? 1 : c.state.tab === 'analytics' ? 2 : 0;
  const tabValue: 'stories' | 'triage' | 'analytics' =
    tabIdx === 1 ? 'triage' : tabIdx === 2 ? 'analytics' : 'stories';

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start gap-4 mb-2">
        <div className="flex-1">
          <PageHeader
            title="Feedback & Errors"
            subtitle="Community feedback and automated API error reports"
          />
        </div>
        <button
          onClick={() => c.setHelpOpen(true)}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          className="border-0 bg-transparent p-0 cursor-pointer text-xs text-muted-foreground inline-flex items-center gap-1 mt-2.5 tracking-wide transition-colors hover:text-primary active:opacity-70"
        >
          press <strong style={{ fontWeight: 700 }}>?</strong> for shortcuts
        </button>
      </div>

      <Tabs
        value={tabValue}
        onValueChange={(v) =>
          c.update({ tab: v as 'stories' | 'triage' | 'analytics' })
        }
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="stories">{`Stories (${c.stories.length})`}</TabsTrigger>
          <TabsTrigger value="triage">{`Triage (${c.totalVisibleCount})`}</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
      </Tabs>

      {tabValue === 'triage' && (
        <TriageTab
          state={c.state}
          update={c.update}
          clearFilters={c.clearFilters}
          activeFilterCount={c.activeFilterCount}
          currentUserId={c.user?.id ?? null}
          admins={c.admins}
          availableLabels={c.availableLabels}
          searchInputRef={c.searchInputRef}
          grouped={c.grouped}
          totalVisibleCount={c.totalVisibleCount}
          voteCounts={c.votesMap}
          selectedIds={c.selectedIds}
          focusedId={c.focusedId}
          watchersByItem={c.watchersByItem}
          adminMap={c.adminMap}
          submissionStoryMap={c.submissionStoryMap}
          sessionStartIso={c.sessionStartIso}
          seenIds={c.seenIds}
          setSeenIds={c.setSeenIds}
          setFocusedId={c.setFocusedId}
          setFocusedColumnIdx={c.setFocusedColumnIdx}
          toggleSelect={c.toggleSelect}
          selectAllVisible={c.selectAllVisible}
          clearSelection={c.clearSelection}
          items={c.items}
          stories={c.stories}
          onSetStatus={(ids, status) => c.statusMutation.mutate({ ids, status })}
          onSetPriority={(ids, priority) => c.priorityMutation.mutate({ ids, priority })}
          onAssign={(ids, assigneeId) => c.assignMutation.mutate({ ids, assigneeId })}
          onSetLabels={(id, labels) => c.labelsMutation.mutate({ id, labels })}
          onForward={(id) => c.forwardMutation.mutate(id)}
          onCreateStoryFromSelection={c.handleCreateStoryFromSelection}
          onAddSelectionToStory={c.handleAddSelectionToStory}
          onAutoTitle={async () => {
            const ids = Array.from(c.selectedIds);
            if (ids.length < 2) return null;
            const res = await c.suggestStoryFromIds.mutateAsync(ids).catch(() => null);
            return res?.proposed_title ?? null;
          }}
          mutationsLoading={
            c.statusMutation.isPending ||
            c.priorityMutation.isPending ||
            c.assignMutation.isPending
          }
        />
      )}

      {tabValue === 'stories' && (
        <StoriesTab
          state={c.state}
          update={c.update}
          storySuggestions={c.storySuggestions}
          groupedStories={c.groupedStories}
          adminMap={c.adminMap}
          onAcceptSuggestion={(id, overrideTitle) =>
            c.acceptStorySuggestion.mutate(
              { suggestionId: id, overrideTitle },
              {
                onSuccess: (storyId) => {
                  c.toast({ title: 'Story created from suggestion' });
                  c.update({ story: storyId });
                },
                onError: (e: Error) =>
                  c.toast({ title: 'Accept failed', description: e.message, variant: 'destructive' }),
              },
            )
          }
          onDismissSuggestion={(id) => c.dismissStorySuggestion.mutate(id)}
        />
      )}

      {tabValue === 'analytics' && (
        <AnalyticsTab items={c.items} voteCounts={c.votesMap} />
      )}

      <StoryDetailDrawer
        open={!!c.state.story}
        story={c.activeStoryBundle?.story ?? null}
        members={c.activeStoryBundle?.members ?? []}
        feedbackById={c.feedbackById}
        errorsById={c.errorsById}
        admins={c.admins}
        adminById={c.adminMap}
        onClose={() => c.update({ story: null })}
        onRename={(title, summary) =>
          c.state.story &&
          c.updateStory.mutate({
            storyId: c.state.story,
            patch: { title, summary: summary || null },
          })
        }
        onStatusChange={(status, closeItems) => {
          if (!c.state.story) return;
          if (status === 'resolved') {
            c.resolveStory.mutate(
              { storyId: c.state.story, closeItems: !!closeItems },
              {
                onSuccess: (n) =>
                  c.toast({
                    title: 'Story resolved',
                    description: closeItems ? `${n} item(s) marked done` : 'Items left untouched',
                  }),
              },
            );
          } else {
            c.updateStory.mutate({
              storyId: c.state.story,
              patch: { status: status as StoryStatus },
            });
            // Story wins on conflict — cascade to members automatically.
            c.cascadeToMembers.mutate({ storyId: c.state.story, status });
          }
        }}
        onPriorityChange={(priority) => {
          if (!c.state.story) return;
          c.updateStory.mutate({ storyId: c.state.story, patch: { priority } });
          c.cascadeToMembers.mutate({ storyId: c.state.story, priority });
        }}
        onAssign={(assigneeId) => {
          if (!c.state.story) return;
          c.updateStory.mutate({
            storyId: c.state.story,
            patch: { assignee_id: assigneeId },
          });
          c.cascadeToMembers.mutate({ storyId: c.state.story, assigneeId });
        }}
        onSaveNarrative={(briefTitle, narrative) =>
          c.state.story &&
          c.setStoryNarrative.mutate({
            storyId: c.state.story,
            briefTitle: briefTitle || null,
            narrative: narrative || null,
          })
        }
        onRenarrate={() =>
          c.state.story &&
          c.renarrateStory.mutate(
            { storyId: c.state.story, force: true },
            {
              onSuccess: (r) =>
                c.toast({
                  title: r?.skipped ? 'Skipped (edited)' : 'Narrative refreshed',
                }),
              onError: (e: Error) =>
                c.toast({
                  title: 'Re-narrate failed',
                  description: e.message,
                  variant: 'destructive',
                }),
            },
          )
        }
        divergence={c.storyDivergence ?? null}
        renarrating={c.renarrateStory.isPending}
        onAddLabel={(label) => {
          if (!c.state.story || !c.activeStoryBundle) return;
          const next = Array.from(
            new Set([...(c.activeStoryBundle.story.labels ?? []), label]),
          );
          c.updateStory.mutate({ storyId: c.state.story, patch: { labels: next } });
        }}
        onRemoveLabel={(label) => {
          if (!c.state.story || !c.activeStoryBundle) return;
          const next = (c.activeStoryBundle.story.labels ?? []).filter((l) => l !== label);
          c.updateStory.mutate({ storyId: c.state.story, patch: { labels: next } });
        }}
        onRemoveMember={(submissionId) =>
          c.state.story &&
          c.removeStoryMembers.mutate({
            storyId: c.state.story,
            submissionIds: [submissionId],
          })
        }
        onOpenMember={(id, ctype) => {
          // Feedback members open in the feedback drawer on top of the story
          // drawer. api_error members have no dedicated item viewer under
          // the Stories-first model; they live inside their parent story.
          if (ctype === 'feedback') {
            c.update({ sel: id });
          }
        }}
      />

      <FeedbackDetailDrawer
        open={c.drawerOpen}
        item={c.selected}
        voteCount={c.selected ? c.votesMap[c.selected.id]?.count ?? 0 : 0}
        admins={c.admins}
        availableLabels={c.availableLabels}
        watchers={c.selected ? c.watchersByItem[c.selected.id] ?? [] : []}
        isForwarding={c.selected ? c.forwardingIds.has(c.selected.id) : false}
        duplicateSuggestions={c.selected ? c.duplicateMap[c.selected.id] ?? [] : []}
        itemsById={c.itemsById}
        canonical={
          c.selected?.duplicate_of ? c.itemsById[c.selected.duplicate_of] ?? null : null
        }
        parentStory={c.selected ? c.submissionStoryMap[c.selected.id] ?? null : null}
        onOpenStory={(storyId) =>
          c.update({ tab: 'stories', story: storyId, sel: null })
        }
        onOpenPartner={(id) => c.update({ sel: id })}
        onMergeDuplicate={(args) => c.mergeDuplicate.mutate(args)}
        onDismissDuplicate={(id) => c.dismissSuggestion.mutate(id)}
        onToggleSpam={(isSpam) =>
          c.selected &&
          updateCommunitySubmission(c.selected.id, { is_spam: isSpam }).then(() =>
            c.queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] }),
          )
        }
        onToggleNotify={(notify) =>
          c.selected &&
          updateCommunitySubmission(c.selected.id, { notify_submitter: notify }).then(() =>
            c.queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] }),
          )
        }
        auditEntries={c.auditEntries}
        adminById={c.adminMap}
        onSendReply={(body, notify) =>
          c.selected &&
          c.replyMutation.mutate({ submissionId: c.selected.id, body, notify })
        }
        isSendingReply={c.replyMutation.isPending}
        onResolutionChange={(resolution) =>
          c.selected && c.resolutionMutation.mutate({ id: c.selected.id, resolution })
        }
        onClose={() => c.update({ sel: null })}
        onStatusChange={(status: KanbanStatus) =>
          c.selected && c.statusMutation.mutate({ ids: [c.selected.id], status })
        }
        onPriorityChange={(priority) =>
          c.selected && c.priorityMutation.mutate({ ids: [c.selected.id], priority })
        }
        onAssign={(assigneeId) =>
          c.selected && c.assignMutation.mutate({ ids: [c.selected.id], assigneeId })
        }
        onAddLabel={(label) => {
          if (!c.selected) return;
          const next = Array.from(new Set([...(c.selected.labels ?? []), label]));
          c.labelsMutation.mutate({ id: c.selected.id, labels: next });
        }}
        onRemoveLabel={(label) => {
          if (!c.selected) return;
          const next = (c.selected.labels ?? []).filter((l) => l !== label);
          c.labelsMutation.mutate({ id: c.selected.id, labels: next });
        }}
        onSaveNotes={(notes) =>
          c.selected && c.notesMutation.mutate({ id: c.selected.id, notes })
        }
        onForward={() => c.selected && c.forwardMutation.mutate(c.selected.id)}
        onCopyPrompt={() => c.selected && c.handleCopyPrompt(c.selected)}
        onRecordHandoff={(target) => {
          if (!c.selected) return;
          c.recordHandoff.mutate({
            submissionId: c.selected.id,
            target,
            promptPreview: formatClaudePrompt(c.selected).slice(0, 160),
          });
        }}
        onUpdateHandoff={(handoffId, status) => {
          if (!c.selected) return;
          c.updateHandoff.mutate({ submissionId: c.selected.id, handoffId, status });
          // Auto-close ticket when the handoff is marked resolved, unless it's
          // already closed. Saves the admin a second click and keeps the kanban
          // aligned with Claude's outcome.
          if (status === 'resolved' && c.selected.feedback_status !== 'done') {
            c.statusMutation.mutate({ ids: [c.selected.id], status: 'done' });
            if (!c.selected.resolution) {
              c.resolutionMutation.mutate({ id: c.selected.id, resolution: 'fixed' });
            }
          }
        }}
        isRecordingHandoff={c.recordHandoff.isPending}
      />

      <FeedbackCommandPalette
        open={c.paletteOpen}
        onOpenChange={c.setPaletteOpen}
        selectedCount={c.selectedIds.size || (c.focusedId ? 1 : 0)}
        admins={c.admins}
        onJumpToColumn={(status) => {
          const idx = kanbanColumns.findIndex((col) => col.id === status);
          if (idx >= 0) {
            c.setFocusedColumnIdx(idx);
            c.setFocusedId(c.grouped[status][0]?.id ?? null);
          }
        }}
        onSetPriority={(priority) =>
          c.actionTargetIds.length &&
          c.priorityMutation.mutate({ ids: c.actionTargetIds, priority })
        }
        onAssign={(assigneeId) =>
          c.actionTargetIds.length &&
          c.assignMutation.mutate({ ids: c.actionTargetIds, assigneeId })
        }
        onForwardSelected={() => {
          for (const id of c.actionTargetIds) c.forwardMutation.mutate(id);
        }}
        onFocusSearch={() => c.searchInputRef.current?.focus()}
        onOpenHelp={() => c.setHelpOpen(true)}
      />

      <ShortcutHelpDialog open={c.helpOpen} onClose={() => c.setHelpOpen(false)} />
    </div>
  );
}
