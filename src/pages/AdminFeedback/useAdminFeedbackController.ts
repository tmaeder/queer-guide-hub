import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

/**
 * Single shared controller for AdminFeedback. Returns every piece of state,
 * derived data, and mutation handler the page + tab components need.
 *
 * Lives outside the page component so the index stays a thin shell, but the
 * hook order is fixed in one place — Rules of Hooks stay intact.
 */
export function useAdminFeedbackController() {
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

  const sessionStartRef = useRef<string>(new Date().toISOString());
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

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

  // Derived API error facets — kept for future filter UI parity.
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

  const filteredItems = useMemo(() => {
    const q = state.q.trim().toLowerCase();
    const viewingSpam = state.tab === 'spam';
    return items.filter((it) => {
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

  const toggleSelect = useCallback(
    (id: string, shift: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shift && lastSelectedId) {
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

  useEffect(() => {
    if (focusedId && !filteredItems.some((it) => it.id === focusedId)) {
      setFocusedId(null);
    }
  }, [filteredItems, focusedId]);

  const moveFocus = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      if (dir === 'left' || dir === 'right') {
        const nextIdx =
          dir === 'left'
            ? Math.max(0, focusedColumnIdx - 1)
            : Math.min(kanbanColumns.length - 1, focusedColumnIdx + 1);
        setFocusedColumnIdx(nextIdx);
        const col = kanbanColumns[nextIdx];
        const colItems = grouped[col.id];
        setFocusedId(colItems[0]?.id ?? null);
        return;
      }
      const col = kanbanColumns[focusedColumnIdx];
      const colItems = grouped[col.id];
      if (colItems.length === 0) return;
      const idx = focusedId ? colItems.findIndex((i) => i.id === focusedId) : -1;
      const nextIdx =
        dir === 'down'
          ? Math.min(colItems.length - 1, idx + 1)
          : idx < 0
            ? 0
            : Math.max(0, idx - 1);
      setFocusedId(colItems[nextIdx]?.id ?? null);
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

  return {
    user,
    toast,
    queryClient,

    state,
    update,
    clearFilters,
    activeFilterCount,
    searchInputRef,

    paletteOpen,
    setPaletteOpen,
    helpOpen,
    setHelpOpen,
    selectedIds,
    focusedId,
    setFocusedId,
    setFocusedColumnIdx,
    forwardingIds,
    drawerOpen,
    sessionStartIso: sessionStartRef.current,
    seenIds,
    setSeenIds,

    items,
    apiErrors,
    isLoading,
    errorsLoading,
    admins,
    adminMap,
    votesMap,
    selected,
    watchersByItem,
    availableLabels,
    itemsById,
    feedbackById,
    errorsById,

    duplicateMap,
    dismissSuggestion,
    mergeDuplicate,
    auditEntries,
    replyMutation,
    recordHandoff,
    updateHandoff,

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

    spamCount,
    grouped,
    totalVisibleCount,
    actionTargetIds,

    statusMutation,
    priorityMutation,
    assignMutation,
    labelsMutation,
    resolutionMutation,
    notesMutation,
    forwardMutation,

    toggleSelect,
    clearSelection,
    selectAllVisible,

    handleCopyPrompt,
    handleCreateStoryFromSelection,
    handleAddSelectionToStory,
  };
}

export type AdminFeedbackController = ReturnType<typeof useAdminFeedbackController>;
