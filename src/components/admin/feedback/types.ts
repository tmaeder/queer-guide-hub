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
}

export interface FeedbackData {
  title: string;
  description: string;
  category: string;
  contact_email?: string | null;
  context?: FeedbackContext;
  screenshot_url?: string | null;
  replies?: FeedbackReply[];
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
