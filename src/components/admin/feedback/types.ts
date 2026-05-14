export interface FeedbackContext {
  url?: string;
  viewport?: { width: number; height: number };
  user_agent?: string;
  color_scheme?: string;
  timestamp?: string;
  errors?: Array<{ message: string; stack?: string; ts: string }>;
  network_failures?: Array<{ method: string; url: string; status: number; ts: string }>;
}

export interface FeedbackReply {
  by: string | null;
  by_name: string;
  body: string;
  at: string;
  emailed?: boolean;
  email_id?: string | null;
  email_error?: string | null;
  github_url?: string | null;
  // Populated by resend-webhook as the email moves through Resend's pipeline.
  delivered_at?: string | null;
  opened_at?: string | null;
  bounced_at?: string | null;
  bounce_reason?: string | null;
  complained_at?: string | null;
}

export type HandoffTarget = 'claude-code' | 'claude-chat' | 'github' | 'other';
export type HandoffStatus = 'sent' | 'in_progress' | 'resolved' | 'failed';

export interface FeedbackHandoff {
  id: string;
  at: string;
  by: string | null;
  by_name: string;
  target: HandoffTarget;
  /** First ~120 chars of the prompt for audit so admins can tell what they sent. */
  prompt_preview?: string | null;
  status: HandoffStatus;
  /** Free-text note (e.g. "Claude landed fix in PR #42"). */
  note?: string | null;
  /** Timestamp of the last status transition, for 'waiting X days' hints. */
  status_at?: string;
}

export interface FeedbackData {
  title: string;
  description: string;
  category: string;
  contact_email?: string | null;
  context?: FeedbackContext;
  screenshot_url?: string | null;
  replies?: FeedbackReply[];
  handoffs?: FeedbackHandoff[];
}

export interface FeedbackAuditEntry {
  id: number;
  submission_id: string;
  actor_id: string | null;
  field: string;
  old_value: unknown;
  new_value: unknown;
  at: string;
}

export interface FeedbackSubmission {
  id: string;
  data: FeedbackData;
  submitted_at: string;
  feedback_status: string;
  reviewer_notes?: string | null;
  github_issue_url?: string | null;
  github_issue_number?: number | null;
  forwarded_at?: string | null;
  priority: number;
  labels: string[];
  assignee_id: string | null;
  duplicate_of: string | null;
  is_spam: boolean;
  resolution: string | null;
  resolved_at: string | null;
  notify_submitter: boolean;
}

export type FeedbackResolution = 'fixed' | 'wontfix' | 'duplicate' | 'invalid';

export interface DuplicateSuggestion {
  id: string;
  a_id: string;
  b_id: string;
  similarity: number;
  dismissed: boolean;
}

export interface AdminProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

// ── Stories ────────────────────────────────────────────────────
// A Story bundles N related feedback items and/or api_error rows so
// admins can triage and hand them off in one go. The Story is a tag:
// member items keep their own independent statuses.

export type StoryStatus = 'open' | 'planned' | 'in_progress' | 'resolved' | 'archived';
export type StoryOrigin = 'manual' | 'ai_suggested';

export interface FeedbackStory {
  id: string;
  title: string;
  summary: string | null;
  brief_title: string | null;
  narrative: string | null;
  narrative_edited: boolean;
  status: StoryStatus;
  priority: number;
  labels: string[];
  assignee_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  origin: StoryOrigin;
  handoffs: FeedbackHandoff[];
  approved_for_claude_at: string | null;
  approved_by: string | null;
  needs_followup_reason: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
}

// ── Routine + Retest ───────────────────────────────────────────
export type RoutineRunStatus =
  | 'queued'
  | 'dispatched'
  | 'in_progress'
  | 'fix_proposed'
  | 'failed'
  | 'cancelled';

export type RoutineRunner = 'mock' | 'github_actions' | 'webhook' | 'api' | 'local';

export interface FeedbackRoutineRun {
  id: string;
  story_id: string;
  status: RoutineRunStatus;
  runner: RoutineRunner;
  prompt: string;
  prompt_hash: string;
  external_ref: string | null;
  pr_url: string | null;
  commit_sha: string | null;
  files_changed: string[] | null;
  fix_summary: string | null;
  confidence: 'low' | 'medium' | 'high' | null;
  risks: string | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export type RetestStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error';
export type RetestKind = 'typecheck' | 'lint' | 'unit' | 'e2e' | 'targeted';

export interface FeedbackRetestRun {
  id: string;
  routine_run_id: string;
  status: RetestStatus;
  kind: RetestKind;
  runner: 'mock' | 'github_actions' | 'webhook' | 'local';
  external_ref: string | null;
  result: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
}

export type StoryEventKind =
  | 'status_changed'
  | 'approved_for_claude'
  | 'needs_followup'
  | 'routine_dispatched'
  | 'routine_progress'
  | 'fix_proposed'
  | 'routine_failed'
  | 'routine_cancelled'
  | 'retest_started'
  | 'retest_finished'
  | 'verified'
  | 'reopened'
  | 'archived'
  | 'unarchived'
  | 'note'
  | 'legacy_handoff';

export interface FeedbackStoryEvent {
  id: number;
  story_id: string;
  kind: StoryEventKind;
  payload: Record<string, unknown>;
  actor_id: string | null;
  actor_kind: 'user' | 'system' | 'runner';
  routine_run_id: string | null;
  retest_run_id: string | null;
  created_at: string;
}

export type StoryPhase =
  | 'new'
  | 'awaiting_review'
  | 'needs_more_context'
  | 'approved'
  | 'fix_in_progress'
  | 'fix_proposed'
  | 'retesting'
  | 'needs_manual_followup'
  | 'ready_to_verify'
  | 'resolved'
  | 'archived';

export interface StoryMember {
  story_id: string;
  submission_id: string;
  added_at: string;
  added_by: string | null;
  confidence: number | null;
}

export interface StorySuggestion {
  id: string;
  proposed_title: string;
  member_ids: string[];
  avg_similarity: number;
  method: 'trigram' | 'embedding' | 'hybrid';
  dismissed: boolean;
  created_at: string;
}

export interface StoryWithCounts extends FeedbackStory {
  member_count: number;
  feedback_count: number;
  error_count: number;
}

export interface SubmissionStoryRef {
  story_id: string;
  title: string;
  status: StoryStatus;
}
