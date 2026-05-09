import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { listCommunitySubmissionsByType } from '@/hooks/usePageFetchers';
import { useFeedbackVoteCounts } from '@/hooks/useFeedbackVote';
import { useFeedbackAdmins, buildAdminMap } from '@/hooks/useFeedbackAdmins';
import { useFeedbackRealtime } from '@/hooks/useFeedbackRealtime';
import {
  useFeedbackDuplicateSuggestions,
  buildDuplicateMap,
  useDismissDuplicateSuggestion,
  useMergeDuplicate,
} from '@/hooks/useFeedbackDuplicates';
import { useFeedbackAudit } from '@/hooks/useFeedbackAudit';
import { useApiErrorDailySeries } from '@/hooks/useFeedbackAnalytics';
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
  DEFAULT_ERROR_FILTERS,
  type ApiErrorFilterState,
} from '@/components/admin/feedback/ApiErrorFilters';
import type { ApiErrorSubmission } from '@/components/admin/feedback/claudePrompts';
import type { FeedbackUrlState } from '@/hooks/useFeedbackUrlState';

const FEEDBACK_COLUMNS =
  'id,data,submitted_at,feedback_status,reviewer_notes,github_issue_url,github_issue_number,forwarded_at,priority,labels,assignee_id,duplicate_of,is_spam,resolution,resolved_at,notify_submitter';
const API_ERROR_COLUMNS =
  'id,data,fingerprint,occurrence_count,last_seen_at,submitted_at,feedback_status,reviewer_notes,github_issue_url,github_issue_number,forwarded_at,priority,labels,assignee_id,duplicate_of,is_spam,resolution,resolved_at,notify_submitter';

export function useFeedbackData(state: FeedbackUrlState) {
  const { user } = useAuth();
  const [errorFilters] = useState<ApiErrorFilterState>(DEFAULT_ERROR_FILTERS);

  const sessionStartRef = useRef<string>(new Date().toISOString());
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading } = useQuery<FeedbackSubmission[]>({
    queryKey: ['admin-feedback-board'],
    queryFn: () =>
      listCommunitySubmissionsByType<FeedbackSubmission>('feedback', FEEDBACK_COLUMNS),
  });

  const { data: apiErrors = [], isLoading: errorsLoading } = useQuery<ApiErrorSubmission[]>({
    queryKey: ['admin-api-errors'],
    queryFn: () =>
      listCommunitySubmissionsByType<ApiErrorSubmission>(
        'api_error',
        API_ERROR_COLUMNS,
        'last_seen_at',
      ),
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

  const { data: duplicateSuggestions = [] } = useFeedbackDuplicateSuggestions();
  const duplicateMap = useMemo(
    () => buildDuplicateMap(duplicateSuggestions),
    [duplicateSuggestions],
  );
  const dismissSuggestion = useDismissDuplicateSuggestion();
  const mergeDuplicate = useMergeDuplicate();

  const { data: auditEntries = [] } = useFeedbackAudit(state.sel);
  const { data: _apiErrorDaily = [] } = useApiErrorDailySeries();

  const spamCount = useMemo(() => items.filter((it) => it.is_spam).length, [items]);

  const filteredItems = useMemo(() => {
    const q = state.q.trim().toLowerCase();
    const viewingSpam = state.tab === 'triage';
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

  const totalVisibleCount = useMemo(
    () => Object.values(grouped).reduce((n, arr) => n + arr.length, 0),
    [grouped],
  );

  return {
    user,
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
    spamCount,
    filteredItems,
    grouped,
    totalVisibleCount,
    sessionStartIso: sessionStartRef.current,
    seenIds,
    setSeenIds,
    errorFilters,
  };
}
