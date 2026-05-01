import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { AnalyticsTab } from '@/components/admin/feedback/analytics/AnalyticsTab';
import { kanbanColumns, type KanbanStatus } from '@/components/admin/feedback/constants';
import { FeedbackCommandPalette } from '@/components/admin/feedback/FeedbackCommandPalette';
import { FeedbackDetailDrawer } from '@/components/admin/feedback/FeedbackDetailDrawer';
import { ShortcutHelpDialog } from '@/components/admin/feedback/ShortcutHelpDialog';
import { StoryDetailDrawer } from '@/components/admin/feedback/StoryDetailDrawer';
import type { StoryStatus } from '@/components/admin/feedback/types';
import { formatClaudePrompt } from '@/components/admin/feedback/claudePrompts';
import { SpamTab } from './SpamTab';
import { StoriesTab } from './StoriesTab';
import { useAdminFeedbackController } from './useAdminFeedbackController';

export default function AdminFeedback() {
  const c = useAdminFeedbackController();

  if (c.isLoading || c.errorsLoading) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Stories is the primary surface. Spam + Analytics are the only escape
  // hatches; Community + API Errors tabs folded into Stories (1-member solo
  // stories auto-created for every item).
  const tabIdx =
    c.state.tab === 'spam' ? 1 : c.state.tab === 'analytics' ? 2 : 0;
  const tabValue: 'stories' | 'spam' | 'analytics' =
    tabIdx === 1 ? 'spam' : tabIdx === 2 ? 'analytics' : 'stories';

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1 }}>
        <Box sx={{ flex: 1 }}>
          <PageHeader
            title="Feedback & Errors"
            subtitle="Community feedback and automated API error reports"
          />
        </Box>
        <Box
          component="button"
          onClick={() => c.setHelpOpen(true)}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          sx={{
            // Flat inline hint matching the project design system
            // (0 radius / 0 borders / 0 shadows) — the "?" is a scanable
            // cue, not a chrome-heavy button.
            border: 0,
            bgcolor: 'transparent',
            p: 0,
            cursor: 'pointer',
            fontSize: '0.75rem',
            color: 'text.secondary',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            mt: 1.25,
            letterSpacing: 0.3,
            transition: 'color 0.15s, opacity 0.15s',
            '&:hover': { color: 'primary.main' },
            '&:active': { opacity: 0.7 },
          }}
        >
          press <strong style={{ fontWeight: 700 }}>?</strong> for shortcuts
        </Box>
      </Box>

      <Tabs
        value={tabIdx}
        onChange={(_, v) =>
          c.update({ tab: v === 1 ? 'spam' : v === 2 ? 'analytics' : 'stories' })
        }
        sx={{ mb: 2 }}
      >
        <Tab label={`Stories (${c.stories.length})`} />
        <Tab label={`Spam (${c.spamCount})`} />
        <Tab label="Analytics" />
      </Tabs>

      {tabValue === 'spam' && (
        <SpamTab
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
          supabase
            .from('community_submissions')
            .update({ is_spam: isSpam })
            .eq('id', c.selected.id)
            .then(() =>
              c.queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] }),
            )
        }
        onToggleNotify={(notify) =>
          c.selected &&
          supabase
            .from('community_submissions')
            .update({ notify_submitter: notify })
            .eq('id', c.selected.id)
            .then(() =>
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
    </Box>
  );
}
