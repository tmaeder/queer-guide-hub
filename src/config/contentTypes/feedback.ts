import { MessageSquarePlus } from 'lucide-react';
import type { ContentTypeConfig } from '@/types/cms';

export const feedbackContentType: ContentTypeConfig = {
  id: 'feedback',
  tableName: 'community_submissions',
  primaryKey: 'id',
  // `community_submissions` keeps the submitted payload in a `data` jsonb — it
  // has no title / description / category / contact_email columns. All four were
  // declared here as required writable fields, so this config could not read or
  // write a single one of them. Fields below are the real triage columns.
  titleField: 'content_type',
  descriptionField: 'reviewer_notes',
  icon: MessageSquarePlus,
  label: { singular: 'Feedback', plural: 'Feedback' },
  color: 'hsl(var(--foreground))',
  fields: [
    { name: 'content_type', label: 'Type', type: 'text', group: 'basic', filterable: true },
    {
      name: 'data',
      label: 'Submission',
      type: 'json',
      group: 'basic',
      colSpan: 2,
      readOnly: true,
      helpText: 'Submitted payload — title, description and contact details live in here.',
    },
    { name: 'source_url', label: 'Source URL', type: 'url', group: 'basic' },
    { name: 'status', label: 'Status', type: 'text', group: 'settings', filterable: true },
    {
      name: 'feedback_status',
      label: 'Feedback Status',
      type: 'text',
      group: 'settings',
      filterable: true,
    },
    { name: 'priority', label: 'Priority', type: 'number', group: 'settings', min: 0, max: 5 },
    { name: 'labels', label: 'Labels', type: 'tags', group: 'settings' },
    { name: 'resolution', label: 'Resolution', type: 'text', group: 'settings' },
    { name: 'reviewer_notes', label: 'Reviewer Notes', type: 'textarea', group: 'settings', colSpan: 2 },
  ],
  defaults: {},
  fieldGroupOrder: ['basic', 'settings'],
  // Feedback is worked on the feedback board, not the All-content list.
  admin: { includeInAllContent: false },
};
