import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useFeedbackVoteCounts } from '@/hooks/useFeedbackVote';
import { useFeedbackUrlState } from '@/hooks/useFeedbackUrlState';
import { useFeedbackAdmins, buildAdminMap } from '@/hooks/useFeedbackAdmins';
import { useFeedbackRealtime } from '@/hooks/useFeedbackRealtime';
import { useFeedbackShortcuts } from '@/hooks/useFeedbackShortcuts';
import {
  useFeedbackDuplicateSuggestions,
  buildDuplicateMap,
  useDismissDuplicateSuggestion,
  useMergeDuplicate,
} from '@/hooks/useFeedbackDuplicates';
import { useFeedbackAudit } from '@/hooks/useFeedbackAudit';
import { useReplyToFeedback } from '@/hooks/useFeedbackReply';
import { useNotifyFeedbackStatus } from '@/hooks/useFeedbackNotify';
import { useRecordHandoff, useUpdateHandoff } from '@/hooks/useFeedbackHandoff';
import { useApiErrorDailySeries } from '@/hooks/useFeedbackAnalytics';
import { AnalyticsTab } from '@/components/admin/feedback/analytics/AnalyticsTab';
import type { FeedbackResolution } from '@/components/admin/feedback/types';
import {
  kanbanColumns,
  kanbanStatusSet,
  type KanbanStatus,
} from '@/components/admin/feedback/constants';
import type {
  AdminProfile,
  FeedbackSubmission,
} from '@/components/admin/feedback/types';
import { FeedbackKanban } from '@/components/admin/feedback/FeedbackKanban';
import { FeedbackFilters } from '@/components/admin/feedback/FeedbackFilters';
import { FeedbackPresets } from '@/components/admin/feedback/FeedbackPresets';
import { FeedbackBulkBar } from '@/components/admin/feedback/FeedbackBulkBar';
import { FeedbackCommandPalette } from '@/components/admin/feedback/FeedbackCommandPalette';
import { FeedbackDetailDrawer } from '@/components/admin/feedback/FeedbackDetailDrawer';
import { ShortcutHelpDialog } from '@/components/admin/feedback/ShortcutHelpDialog';
import { StoriesKanban } from '@/components/admin/feedback/StoriesKanban';
import { StoryDetailDrawer } from '@/components/admin/feedback/StoryDetailDrawer';
import { StorySuggestionsPanel } from '@/components/admin/feedback/StorySuggestionsPanel';
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
import type { StoryStatus } from '@/components/admin/feedback/types';
import {
  DEFAULT_ERROR_FILTERS,
  type ApiErrorFilterState,
  type ErrorSource,
  type ErrorSeverity,
} from '@/components/admin/feedback/ApiErrorFilters';
import {
  formatClaudePrompt,
  type ApiErrorSubmission,
} from '@/components/admin/feedback/claudePrompts';

const FEEDBACK_COLUMNS =
  'id,data,submitted_at,feedback_status,reviewer_notes,github_issue_url,github_issue_number,forwarded_at,priority,labels,assignee_id,duplicate_of,is_spam,resolution,resolved_at,notify_submitter';
const API_ERROR_COLUMNS =
  'id,data,fingerprint,occurrence_count,last_seen_at,submitted_at,feedback_status,reviewer_notes,github_issue_url,github_issue_number,forwarded_at,priority,labels,assignee_id,duplicate_of,is_spam,resolution,resolved_at,notify_submitter';

export default function AdminFeedback() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { state, update, clearFilters, activeFilterCount } = useFeedbackUrlState();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedColumnIdx, setFocusedColumnIdx] = useState(0);
  const [forwardingIds, setForwardingIds] = useState<Set<string>>(new Set());
  const [errorFilters, _setErrorFilters] =
    useState<ApiErrorFilterState>(DEFAULT_ERROR_FILTERS);
  const drawerOpen = !!state.sel;

  // Tickets submitted after page-load count as "new since session start"
  // (pulse indicator on the card). Opening the drawer marks them seen.
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  // ── Queries ─────────────────────────────────────────────────
  const { data: items = [], isLoading } = useQuery<FeedbackSubmission[]>({
    queryKey: ['admin-feedback-board'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_submissions')
        .select(FEEDBACK_COLUMNS)
        .eq('content_type', 'feedback')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as FeedbackSubmission[]) || [];
    },
  });

  const { data: apiErrors = [], isLoading: errorsLoading } = useQuery<ApiErrorSubmission[]>({
    queryKey: ['admin-api-errors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_submissions')
        .select(API_ERROR_COLUMNS)
        .eq('content_type', 'api_error')
        .order('last_seen_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as ApiErrorSubmission[]) || [];
    },
  });

  const { data: admins = [] } = useFeedbackAdmins();
  const adminMap = useMemo(() => buildAdminMap(admins), [admins]);

  const submissionIds = useMemo(() => items.map((i) => i.id), [items]);
  const { data: votesMap = {} } = useFeedbackVoteCounts(submissionIds);

  const selected = useMemo(
    () => items.find((i) => i.id === state.sel) ?? null,
    [items, state.sel],
  );

  // Realtime: invalidate queries + track which admins view which submission.
  const { online } = useFeedbackRealtime(state.sel);
  const watchersByItem = useMemo(() => {
    const map: Record<string, AdminProfile[]> = {};
    for (const p of online) {
      if (!p.viewingId || p.userId === user?.id) continue;
      const profile: AdminProfile = adminMap[p.userId] ?? {
        user_id: p.userId,
        display_name: p.displayName,
        avatar_url: null,
      };
      (map[p.viewingId] ??= []).push(profile);
    }
    return map;
  }, [online, adminMap, user]);

  const availableLabels = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) for (const l of it.labels || []) set.add(l);
    return Array.from(set).sort();
  }, [items]);

  const itemsById = useMemo(() => {
    const map: Record<string, FeedbackSubmission> = {};
    for (const it of items) map[it.id] = it;
    return map;
  }, [items]);

  const { data: duplicateSuggestions = [] } = useFeedbackDuplicateSuggestions();
  const duplicateMap = useMemo(() => buildDuplicateMap(duplicateSuggestions), [duplicateSuggestions]);
  const dismissSuggestion = useDismissDuplicateSuggestion();
  const mergeDuplicate = useMergeDuplicate();

  const { data: auditEntries = [] } = useFeedbackAudit(state.sel);
  const replyMutation = useReplyToFeedback();
  const notifyStatus = useNotifyFeedbackStatus();
  const recordHandoff = useRecordHandoff();
  const updateHandoff = useUpdateHandoff();
  const { data: _apiErrorDaily = [] } = useApiErrorDailySeries();

  // Stories — loaded on all tabs so the story chip on individual cards can
  // render without a second round trip when the admin switches tabs.
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

  const feedbackById = useMemo(() => {
    const map: Record<string, FeedbackSubmission> = {};
    for (const it of items) map[it.id] = it;
    return map;
  }, [items]);
  const errorsById = useMemo(() => {
    const map: Record<string, ApiErrorSubmission> = {};
    for (const e of apiErrors) map[e.id] = e;
    return map;
  }, [apiErrors]);

  // ── API error filtering ───────────────────────────────────────
  // Derive source + severity from the existing row shape so we can narrow
  // 100s of rows to the one the admin wants to triage without adding new
  // columns.
  const _errorFacets = useMemo(() => {
    const bySource: Record<ErrorSource, number> = {
      runtime: 0,
      advisor: 0,
      'github-actions': 0,
    };
    const bySeverity: Record<ErrorSeverity, number> = {
      ERROR: 0,
      WARN: 0,
      INFO: 0,
    };
    let resolved = 0;
    for (const e of apiErrors) {
      const meta = (e.data.metadata ?? {}) as {
        source?: string;
        severity?: string;
      };
      const src: ErrorSource =
        meta.source === 'supabase-advisor'
          ? 'advisor'
          : e.data.service === 'github-actions'
            ? 'github-actions'
            : 'runtime';
      bySource[src] += 1;
      if (meta.severity === 'ERROR' || meta.severity === 'WARN' || meta.severity === 'INFO') {
        bySeverity[meta.severity] += 1;
      }
      if (e.feedback_status === 'done') resolved += 1;
    }
    return { bySource, bySeverity, resolved };
  }, [apiErrors]);

  const _visibleApiErrors = useMemo(() => {
    const q = errorFilters.q.trim().toLowerCase();
    return apiErrors.filter((e) => {
      if (errorFilters.hideResolved && e.feedback_status === 'done') return false;
      const meta = (e.data.metadata ?? {}) as {
        source?: string;
        severity?: string;
      };
      const src: ErrorSource =
        meta.source === 'supabase-advisor'
          ? 'advisor'
          : e.data.service === 'github-actions'
            ? 'github-actions'
            : 'runtime';
      if (errorFilters.sources.length > 0 && !errorFilters.sources.includes(src)) {
        return false;
      }
      if (errorFilters.severities.length > 0) {
        if (!meta.severity) return false;
        if (!errorFilters.severities.includes(meta.severity as ErrorSeverity)) return false;
      }
      if (q) {
        const hay = [
          e.data.message ?? '',
          e.data.service ?? '',
          e.data.function_name ?? '',
          (meta as { rule?: string }).rule ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [apiErrors, errorFilters]);

  const fireStatusNotification = useCallback(
    (ids: string[], status: KanbanStatus) => {
      for (const id of ids) {
        const it = items.find((i) => i.id === id);
        if (!it || it.is_spam || it.duplicate_of || !it.notify_submitter) continue;
        if (!it.data.contact_email) continue;
        const event = status === 'done' ? 'resolved' : 'status_changed';
        notifyStatus.mutate({ submissionId: id, event, newStatus: status });
      }
    },
    [items, notifyStatus],
  );

  const spamCount = useMemo(() => items.filter((it) => it.is_spam).length, [items]);
  const _communityCount = useMemo(() => items.filter((it) => !it.is_spam).length, [items]);

  // ── Filtering + grouping ────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = state.q.trim().toLowerCase();
    const viewingSpam = state.tab === 'spam';
    return items.filter((it) => {
      // Spam/duplicate visibility rules vary by tab.
      if (viewingSpam) {
        if (!it.is_spam) return false;
      } else {
        if (it.is_spam && !state.showSpam) return false;
        if (it.duplicate_of && !state.showDuplicates) return false;
      }

      const d = it.data || ({} as FeedbackSubmission['data']);
      if (q) {
        const haystack = [d.title, d.description, d.context?.url]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (state.category && d.category !== state.category) return false;
      if (state.status && it.feedback_status !== state.status) return false;
      if (state.priority != null && (it.priority ?? 2) !== state.priority) return false;
      if (state.assignee === '__unassigned__' && it.assignee_id) return false;
      if (state.assignee && state.assignee !== '__unassigned__' && it.assignee_id !== state.assignee)
        return false;
      if (state.label && !(it.labels ?? []).includes(state.label)) return false;
      if (state.hasScreenshot && !d.screenshot_url) return false;
      if (state.hasErrors && !(d.context?.errors && d.context.errors.length > 0)) return false;
      if (state.withClaude) {
        // Matches either path: an open Claude handoff (copy/paste workflow)
        // or a forwarded GitHub issue still being worked on.
        const handoffs = it.data.handoffs ?? [];
        const hasOpenHandoff = handoffs.some(
          (h) => h.status === 'sent' || h.status === 'in_progress',
        );
        const forwardedOpen = !!it.github_issue_url && it.feedback_status !== 'done';
        if (!hasOpenHandoff && !forwardedOpen) return false;
      }
      return true;
    });
  }, [items, state]);

  const grouped = useMemo(() => {
    const map: Record<KanbanStatus, FeedbackSubmission[]> = {
      new: [],
      under_review: [],
      planned: [],
      in_progress: [],
      done: [],
    };
    for (const item of filteredItems) {
      const status = (item.feedback_status || 'new') as KanbanStatus;
      const col = kanbanStatusSet.has(status) ? status : 'new';
      map[col].push(item);
    }
    for (const col of kanbanColumns) {
      map[col.id].sort((a, b) => {
        const prioDiff = (a.priority ?? 2) - (b.priority ?? 2);
        if (prioDiff !== 0) return prioDiff;
        return (votesMap[b.id]?.count ?? 0) - (votesMap[a.id]?.count ?? 0);
      });
    }
    return map;
  }, [filteredItems, votesMap]);

  // ── Mutations ───────────────────────────────────────────────
  const updateRow = useCallback(
    async (ids: string[], patch: Record<string, unknown>) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('community_submissions')
        .update({
          ...patch,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .in('id', ids);
      if (error) throw error;
    },
    [user],
  );

  const pushToGithub = useCallback(
    (id: string, action: 'reply' | 'close' | 'reopen' | 'set_labels', extra: Record<string, unknown> = {}) => {
      const it = items.find((i) => i.id === id);
      if (!it?.github_issue_number) return;
      void supabase.functions
        .invoke('push-feedback-to-github', { body: { submission_id: id, action, ...extra } })
        .catch((e) => console.warn('push-feedback-to-github failed', e));
    },
    [items],
  );

  const statusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: KanbanStatus }) =>
      updateRow(ids, { feedback_status: status }),
    onMutate: async ({ ids, status }) => {
      const idSet = new Set(ids);
      queryClient.setQueryData<FeedbackSubmission[]>(['admin-feedback-board'], (old) =>
        old?.map((it) => (idSet.has(it.id) ? { ...it, feedback_status: status } : it)),
      );
    },
    onSuccess: (_data, { ids, status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      fireStatusNotification(ids, status);
      for (const id of ids) {
        if (status === 'done') pushToGithub(id, 'close', { resolution: 'fixed' });
        else if (status === 'in_progress') pushToGithub(id, 'reopen');
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
    },
  });

  const priorityMutation = useMutation({
    mutationFn: ({ ids, priority }: { ids: string[]; priority: number }) =>
      updateRow(ids, { priority }),
    onMutate: async ({ ids, priority }) => {
      const idSet = new Set(ids);
      queryClient.setQueryData<FeedbackSubmission[]>(['admin-feedback-board'], (old) =>
        old?.map((it) => (idSet.has(it.id) ? { ...it, priority } : it)),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] }),
    onError: (err: Error) =>
      toast({ title: 'Priority failed', description: err.message, variant: 'destructive' }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ ids, assigneeId }: { ids: string[]; assigneeId: string | null }) =>
      updateRow(ids, { assignee_id: assigneeId }),
    onMutate: async ({ ids, assigneeId }) => {
      const idSet = new Set(ids);
      queryClient.setQueryData<FeedbackSubmission[]>(['admin-feedback-board'], (old) =>
        old?.map((it) => (idSet.has(it.id) ? { ...it, assignee_id: assigneeId } : it)),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] }),
    onError: (err: Error) =>
      toast({ title: 'Assign failed', description: err.message, variant: 'destructive' }),
  });

  const labelsMutation = useMutation({
    mutationFn: async ({ id, labels }: { id: string; labels: string[] }) => {
      const { error } = await supabase
        .from('community_submissions')
        .update({ labels })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, labels }) => {
      queryClient.setQueryData<FeedbackSubmission[]>(['admin-feedback-board'], (old) =>
        old?.map((it) => (it.id === id ? { ...it, labels } : it)),
      );
    },
    onSuccess: (_data, { id, labels }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      pushToGithub(id, 'set_labels', { labels });
    },
    onError: (err: Error) =>
      toast({ title: 'Labels failed', description: err.message, variant: 'destructive' }),
  });

  const resolutionMutation = useMutation({
    mutationFn: async ({
      id,
      resolution,
    }: {
      id: string;
      resolution: FeedbackResolution | null;
    }) => {
      const { error } = await supabase
        .from('community_submissions')
        .update({
          resolution,
          resolved_at: resolution ? new Date().toISOString() : null,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      return { id, resolution };
    },
    onSuccess: (_data, { id, resolution }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      if (resolution) pushToGithub(id, 'close', { resolution });
      else pushToGithub(id, 'reopen');
      const it = items.find((i) => i.id === id);
      if (!it || it.is_spam || it.duplicate_of || !it.notify_submitter) return;
      if (!it.data.contact_email) return;
      notifyStatus.mutate({
        submissionId: id,
        event: resolution ? 'resolved' : 'reopened',
      });
    },
    onError: (err: Error) =>
      toast({ title: 'Resolution failed', description: err.message, variant: 'destructive' }),
  });

  const notesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from('community_submissions')
        .update({ reviewer_notes: notes })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      toast({ title: 'Notes saved' });
    },
  });

  const forwardMutation = useMutation({
    mutationFn: async (id: string) => {
      setForwardingIds((prev) => new Set(prev).add(id));
      try {
        const { data, error } = await supabase.functions.invoke('forward-feedback-to-github', {
          body: { submission_id: id },
        });
        if (error) throw error;
        return { id, data };
      } finally {
        setForwardingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    onSuccess: ({ id, data }) => {
      if (data?.already_forwarded) {
        toast({ title: 'Already forwarded', description: `Issue #${data.number}` });
      } else {
        toast({ title: 'Forwarded to GitHub', description: `Issue #${data.number} created` });
      }
      queryClient.setQueryData<FeedbackSubmission[]>(['admin-feedback-board'], (old) =>
        old?.map((it) =>
          it.id === id
            ? {
                ...it,
                github_issue_url: data.url,
                github_issue_number: data.number,
                forwarded_at: new Date().toISOString(),
              }
            : it,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['admin-api-errors'] });
      // Notify submitter that their ticket went to Claude — only for community
      // feedback rows (api_error rows have no submitter).
      const it = items.find((i) => i.id === id);
      if (
        it &&
        !it.is_spam &&
        !it.duplicate_of &&
        it.notify_submitter &&
        it.data?.contact_email
      ) {
        notifyStatus.mutate({ submissionId: id, event: 'handed_to_claude' });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Forward failed', description: err.message, variant: 'destructive' });
    },
  });

  // ── Selection helpers ───────────────────────────────────────
  const toggleSelect = useCallback(
    (id: string, shift: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shift && lastSelectedId) {
          // Range select within current focused column.
          const col = kanbanColumns[focusedColumnIdx];
          const colIds = grouped[col.id].map((i) => i.id);
          const aIdx = colIds.indexOf(lastSelectedId);
          const bIdx = colIds.indexOf(id);
          if (aIdx >= 0 && bIdx >= 0) {
            const [lo, hi] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
            for (let i = lo; i <= hi; i++) next.add(colIds[i]);
            setLastSelectedId(id);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setLastSelectedId(id);
        return next;
      });
    },
    [grouped, focusedColumnIdx, lastSelectedId],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const selectAllVisible = useCallback(() => {
    const next = new Set<string>();
    for (const col of kanbanColumns) for (const it of grouped[col.id]) next.add(it.id);
    setSelectedIds(next);
  }, [grouped]);

  const totalVisibleCount = useMemo(
    () => Object.values(grouped).reduce((n, arr) => n + arr.length, 0),
    [grouped],
  );

  // Keep focus valid as cards get filtered out.
  useEffect(() => {
    if (focusedId && !filteredItems.some((it) => it.id === focusedId)) {
      setFocusedId(null);
    }
  }, [filteredItems, focusedId]);

  // ── Keyboard navigation ─────────────────────────────────────
  const moveFocus = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      if (dir === 'left' || dir === 'right') {
        const nextIdx =
          dir === 'left'
            ? Math.max(0, focusedColumnIdx - 1)
            : Math.min(kanbanColumns.length - 1, focusedColumnIdx + 1);
        setFocusedColumnIdx(nextIdx);
        const col = kanbanColumns[nextIdx];
        const items = grouped[col.id];
        setFocusedId(items[0]?.id ?? null);
        return;
      }
      const col = kanbanColumns[focusedColumnIdx];
      const items = grouped[col.id];
      if (items.length === 0) return;
      const idx = focusedId ? items.findIndex((i) => i.id === focusedId) : -1;
      const nextIdx =
        dir === 'down'
          ? Math.min(items.length - 1, idx + 1)
          : idx < 0
            ? 0
            : Math.max(0, idx - 1);
      setFocusedId(items[nextIdx]?.id ?? null);
    },
    [focusedColumnIdx, focusedId, grouped],
  );

  const actionTargetIds = useMemo(() => {
    if (selectedIds.size > 0) return Array.from(selectedIds);
    if (focusedId) return [focusedId];
    return [];
  }, [selectedIds, focusedId]);

  const handleCopyPrompt = useCallback(
    async (item: FeedbackSubmission) => {
      try {
        await navigator.clipboard.writeText(formatClaudePrompt(item));
        toast({ title: 'Prompt copied', description: 'Paste into Claude Code' });
      } catch {
        toast({
          title: 'Copy failed',
          description: 'Clipboard unavailable',
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  useFeedbackShortcuts(!isLoading, {
    onFocusSearch: () => searchInputRef.current?.focus(),
    onOpenPalette: () => setPaletteOpen(true),
    onOpenHelp: () => setHelpOpen(true),
    onEscape: () => {
      if (selectedIds.size > 0) clearSelection();
      else if (drawerOpen) update({ sel: null });
    },
    onMoveCard: moveFocus,
    onOpenFocused: () => {
      if (focusedId) update({ sel: focusedId });
    },
    onSetStatusIndex: (i) => {
      const status = kanbanColumns[i]?.id;
      if (status && actionTargetIds.length) {
        statusMutation.mutate({ ids: actionTargetIds, status });
      }
    },
    onSetPriority: (priority) => {
      if (actionTargetIds.length) priorityMutation.mutate({ ids: actionTargetIds, priority });
    },
    onAssignPicker: () => setPaletteOpen(true),
    onForwardFocused: () => {
      if (focusedId) forwardMutation.mutate(focusedId);
    },
    onCopyHandoff: () => {
      if (!focusedId) return;
      const item = items.find((i) => i.id === focusedId);
      if (!item) return;
      const prompt = formatClaudePrompt(item);
      navigator.clipboard.writeText(prompt).catch(() => {});
      recordHandoff.mutate({
        submissionId: focusedId,
        target: 'claude-code',
        promptPreview: prompt.slice(0, 160),
      });
      toast({ title: 'Prompt copied + handoff recorded' });
    },
    onToggleSelectFocused: (shift) => {
      if (focusedId) toggleSelect(focusedId, shift);
    },
  });

  const handleCreateStoryFromSelection = useCallback(
    (title: string) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      createStory.mutate(
        { title, submissionIds: ids },
        {
          onSuccess: (storyId) => {
            toast({ title: 'Story created', description: `${ids.length} items bundled` });
            clearSelection();
            update({ tab: 'stories', story: storyId });
          },
          onError: (e: Error) =>
            toast({ title: 'Create story failed', description: e.message, variant: 'destructive' }),
        },
      );
    },
    [selectedIds, createStory, toast, clearSelection, update],
  );

  const handleAddSelectionToStory = useCallback(
    (storyId: string) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      addStoryMembers.mutate(
        { storyId, submissionIds: ids },
        {
          onSuccess: () => {
            toast({ title: 'Added to story', description: `${ids.length} item(s)` });
            clearSelection();
          },
          onError: (e: Error) =>
            toast({ title: 'Add to story failed', description: e.message, variant: 'destructive' }),
        },
      );
    },
    [selectedIds, addStoryMembers, toast, clearSelection],
  );

  // ── Render ──────────────────────────────────────────────────
  if (isLoading || errorsLoading) {
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
    state.tab === 'spam' ? 1 : state.tab === 'analytics' ? 2 : 0;
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
          onClick={() => setHelpOpen(true)}
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
          update({
            tab: v === 1 ? 'spam' : v === 2 ? 'analytics' : 'stories',
          })
        }
        sx={{ mb: 2 }}
      >
        <Tab label={`Stories (${stories.length})`} />
        <Tab label={`Spam (${spamCount})`} />
        <Tab label="Analytics" />
      </Tabs>

      {tabValue === 'spam' && (
        <>
          <FeedbackPresets
            state={state}
            update={update}
            clearFilters={clearFilters}
            currentUserId={user?.id ?? null}
          />
          <FeedbackFilters
            state={state}
            update={update}
            clearFilters={clearFilters}
            activeFilterCount={activeFilterCount}
            admins={admins}
            labels={availableLabels}
            searchInputRef={searchInputRef}
          />

          {totalVisibleCount === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
              {activeFilterCount > 0
                ? 'No submissions match the current filters.'
                : 'No submissions yet.'}
            </Typography>
          ) : (
            <FeedbackKanban
              grouped={grouped}
              voteCounts={votesMap}
              selectedIds={selectedIds}
              focusedId={focusedId}
              watchersByItem={watchersByItem}
              adminById={adminMap}
              storyByItem={submissionStoryMap}
              onStoryClick={(storyId) => update({ tab: 'stories', story: storyId })}
              isNew={(id, submittedAt) =>
                submittedAt > sessionStartRef.current && !seenIds.has(id)
              }
              onCardClick={(item) => {
                setFocusedId(item.id);
                const colIdx = kanbanColumns.findIndex((c) => c.id === (item.feedback_status as KanbanStatus));
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
              onStatusDrop={(id, status) => statusMutation.mutate({ ids: [id], status })}
            />
          )}

          <FeedbackBulkBar
            selectedCount={selectedIds.size}
            totalCount={totalVisibleCount}
            onSelectAll={selectAllVisible}
            onClear={clearSelection}
            onSetStatus={(status) =>
              statusMutation.mutate({ ids: Array.from(selectedIds), status })
            }
            onSetPriority={(priority) =>
              priorityMutation.mutate({ ids: Array.from(selectedIds), priority })
            }
            onAssign={(assigneeId) =>
              assignMutation.mutate({ ids: Array.from(selectedIds), assigneeId })
            }
            onAddLabel={(label) => {
              for (const id of selectedIds) {
                const it = items.find((i) => i.id === id);
                if (!it) continue;
                const next = Array.from(new Set([...(it.labels ?? []), label]));
                labelsMutation.mutate({ id, labels: next });
              }
            }}
            onForward={() => {
              for (const id of selectedIds) forwardMutation.mutate(id);
            }}
            onCreateStory={handleCreateStoryFromSelection}
            onAddToStory={handleAddSelectionToStory}
            onAutoTitle={async () => {
              const ids = Array.from(selectedIds);
              if (ids.length < 2) return null;
              const res = await suggestStoryFromIds.mutateAsync(ids).catch(() => null);
              return res?.proposed_title ?? null;
            }}
            stories={stories}
            admins={admins}
            loading={
              statusMutation.isPending || priorityMutation.isPending || assignMutation.isPending
            }
          />
        </>
      )}

      {tabValue === 'stories' && (
        <>
          <StorySuggestionsPanel
            suggestions={storySuggestions}
            onAccept={(id, overrideTitle) =>
              acceptStorySuggestion.mutate(
                { suggestionId: id, overrideTitle },
                {
                  onSuccess: (storyId) => {
                    toast({ title: 'Story created from suggestion' });
                    update({ story: storyId });
                  },
                  onError: (e: Error) =>
                    toast({ title: 'Accept failed', description: e.message, variant: 'destructive' }),
                },
              )
            }
            onDismiss={(id) => dismissStorySuggestion.mutate(id)}
          />
          <StoriesKanban
            grouped={groupedStories}
            adminById={adminMap}
            onStoryClick={(s) => update({ story: s.id })}
          />
        </>
      )}

      {tabValue === 'analytics' && (
        <AnalyticsTab items={items} voteCounts={votesMap} />
      )}

      <StoryDetailDrawer
        open={!!state.story}
        story={activeStoryBundle?.story ?? null}
        members={activeStoryBundle?.members ?? []}
        feedbackById={feedbackById}
        errorsById={errorsById}
        admins={admins}
        adminById={adminMap}
        onClose={() => update({ story: null })}
        onRename={(title, summary) =>
          state.story &&
          updateStory.mutate({ storyId: state.story, patch: { title, summary: summary || null } })
        }
        onStatusChange={(status, closeItems) => {
          if (!state.story) return;
          if (status === 'resolved') {
            resolveStory.mutate(
              { storyId: state.story, closeItems: !!closeItems },
              {
                onSuccess: (n) =>
                  toast({
                    title: 'Story resolved',
                    description: closeItems ? `${n} item(s) marked done` : 'Items left untouched',
                  }),
              },
            );
          } else {
            updateStory.mutate({
              storyId: state.story,
              patch: { status: status as StoryStatus },
            });
            // Story wins on conflict — cascade to members automatically.
            cascadeToMembers.mutate({ storyId: state.story, status });
          }
        }}
        onPriorityChange={(priority) => {
          if (!state.story) return;
          updateStory.mutate({ storyId: state.story, patch: { priority } });
          cascadeToMembers.mutate({ storyId: state.story, priority });
        }}
        onAssign={(assigneeId) => {
          if (!state.story) return;
          updateStory.mutate({ storyId: state.story, patch: { assignee_id: assigneeId } });
          cascadeToMembers.mutate({ storyId: state.story, assigneeId });
        }}
        onSaveNarrative={(briefTitle, narrative) =>
          state.story &&
          setStoryNarrative.mutate({
            storyId: state.story,
            briefTitle: briefTitle || null,
            narrative: narrative || null,
          })
        }
        onRenarrate={() =>
          state.story &&
          renarrateStory.mutate(
            { storyId: state.story, force: true },
            {
              onSuccess: (r) =>
                toast({
                  title: r?.skipped ? 'Skipped (edited)' : 'Narrative refreshed',
                }),
              onError: (e: Error) =>
                toast({ title: 'Re-narrate failed', description: e.message, variant: 'destructive' }),
            },
          )
        }
        divergence={storyDivergence ?? null}
        renarrating={renarrateStory.isPending}
        onAddLabel={(label) => {
          if (!state.story || !activeStoryBundle) return;
          const next = Array.from(new Set([...(activeStoryBundle.story.labels ?? []), label]));
          updateStory.mutate({ storyId: state.story, patch: { labels: next } });
        }}
        onRemoveLabel={(label) => {
          if (!state.story || !activeStoryBundle) return;
          const next = (activeStoryBundle.story.labels ?? []).filter((l) => l !== label);
          updateStory.mutate({ storyId: state.story, patch: { labels: next } });
        }}
        onRemoveMember={(submissionId) =>
          state.story &&
          removeStoryMembers.mutate({ storyId: state.story, submissionIds: [submissionId] })
        }
        onOpenMember={(id, ctype) => {
          // Feedback members open in the feedback drawer on top of the story
          // drawer. api_error members have no dedicated item viewer under
          // the Stories-first model; they live inside their parent story.
          if (ctype === 'feedback') {
            update({ sel: id });
          }
        }}
      />

      <FeedbackDetailDrawer
        open={drawerOpen}
        item={selected}
        voteCount={selected ? votesMap[selected.id]?.count ?? 0 : 0}
        admins={admins}
        availableLabels={availableLabels}
        watchers={selected ? watchersByItem[selected.id] ?? [] : []}
        isForwarding={selected ? forwardingIds.has(selected.id) : false}
        duplicateSuggestions={selected ? duplicateMap[selected.id] ?? [] : []}
        itemsById={itemsById}
        canonical={
          selected?.duplicate_of ? itemsById[selected.duplicate_of] ?? null : null
        }
        parentStory={selected ? submissionStoryMap[selected.id] ?? null : null}
        onOpenStory={(storyId) => update({ tab: 'stories', story: storyId, sel: null })}
        onOpenPartner={(id) => update({ sel: id })}
        onMergeDuplicate={(args) => mergeDuplicate.mutate(args)}
        onDismissDuplicate={(id) => dismissSuggestion.mutate(id)}
        onToggleSpam={(isSpam) =>
          selected &&
          supabase
            .from('community_submissions')
            .update({ is_spam: isSpam })
            .eq('id', selected.id)
            .then(() =>
              queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] }),
            )
        }
        onToggleNotify={(notify) =>
          selected &&
          supabase
            .from('community_submissions')
            .update({ notify_submitter: notify })
            .eq('id', selected.id)
            .then(() =>
              queryClient.invalidateQueries({ queryKey: ['admin-feedback-board'] }),
            )
        }
        auditEntries={auditEntries}
        adminById={adminMap}
        onSendReply={(body, notify) =>
          selected &&
          replyMutation.mutate({ submissionId: selected.id, body, notify })
        }
        isSendingReply={replyMutation.isPending}
        onResolutionChange={(resolution) =>
          selected && resolutionMutation.mutate({ id: selected.id, resolution })
        }
        onClose={() => update({ sel: null })}
        onStatusChange={(status) =>
          selected && statusMutation.mutate({ ids: [selected.id], status })
        }
        onPriorityChange={(priority) =>
          selected && priorityMutation.mutate({ ids: [selected.id], priority })
        }
        onAssign={(assigneeId) =>
          selected && assignMutation.mutate({ ids: [selected.id], assigneeId })
        }
        onAddLabel={(label) => {
          if (!selected) return;
          const next = Array.from(new Set([...(selected.labels ?? []), label]));
          labelsMutation.mutate({ id: selected.id, labels: next });
        }}
        onRemoveLabel={(label) => {
          if (!selected) return;
          const next = (selected.labels ?? []).filter((l) => l !== label);
          labelsMutation.mutate({ id: selected.id, labels: next });
        }}
        onSaveNotes={(notes) => selected && notesMutation.mutate({ id: selected.id, notes })}
        onForward={() => selected && forwardMutation.mutate(selected.id)}
        onCopyPrompt={() => selected && handleCopyPrompt(selected)}
        onRecordHandoff={(target) => {
          if (!selected) return;
          recordHandoff.mutate({
            submissionId: selected.id,
            target,
            promptPreview: formatClaudePrompt(selected).slice(0, 160),
          });
        }}
        onUpdateHandoff={(handoffId, status) => {
          if (!selected) return;
          updateHandoff.mutate({ submissionId: selected.id, handoffId, status });
          // Auto-close ticket when the handoff is marked resolved, unless it's
          // already closed. Saves the admin a second click and keeps the kanban
          // aligned with Claude's outcome.
          if (status === 'resolved' && selected.feedback_status !== 'done') {
            statusMutation.mutate({ ids: [selected.id], status: 'done' });
            if (!selected.resolution) {
              resolutionMutation.mutate({ id: selected.id, resolution: 'fixed' });
            }
          }
        }}
        isRecordingHandoff={recordHandoff.isPending}
      />

      <FeedbackCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        selectedCount={selectedIds.size || (focusedId ? 1 : 0)}
        admins={admins}
        onJumpToColumn={(status) => {
          const idx = kanbanColumns.findIndex((c) => c.id === status);
          if (idx >= 0) {
            setFocusedColumnIdx(idx);
            setFocusedId(grouped[status][0]?.id ?? null);
          }
        }}
        onSetPriority={(priority) =>
          actionTargetIds.length && priorityMutation.mutate({ ids: actionTargetIds, priority })
        }
        onAssign={(assigneeId) =>
          actionTargetIds.length && assignMutation.mutate({ ids: actionTargetIds, assigneeId })
        }
        onForwardSelected={() => {
          for (const id of actionTargetIds) forwardMutation.mutate(id);
        }}
        onFocusSearch={() => searchInputRef.current?.focus()}
        onOpenHelp={() => setHelpOpen(true)}
      />

      <ShortcutHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </Box>
  );
}
