/** Snapshot metadata stored on `messages.metadata` for message_type='submission'. */
export interface SubmissionMeta {
  kind: 'submission';
  submission_ids: string[];
  items: { id: string; content_type: string; title: string }[];
  submitted_by: string;
}

export function isSubmissionMeta(meta: unknown): meta is SubmissionMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    (meta as { kind?: string }).kind === 'submission' &&
    Array.isArray((meta as { submission_ids?: unknown }).submission_ids) &&
    Array.isArray((meta as { items?: unknown }).items)
  );
}
