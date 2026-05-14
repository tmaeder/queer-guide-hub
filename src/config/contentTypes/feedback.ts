import { MessageSquarePlus } from 'lucide-react';
import type { ContentTypeConfig } from '@/types/cms';

export const feedbackContentType: ContentTypeConfig = {
  id: 'feedback',
  tableName: 'community_submissions',
  primaryKey: 'id',
  titleField: 'title',
  descriptionField: 'description',
  icon: MessageSquarePlus,
  label: { singular: 'Feedback', plural: 'Feedback' },
  color: '#DB2777',
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true, group: 'basic', maxLength: 200 },
    { name: 'description', label: 'Description', type: 'textarea', required: true, group: 'basic', colSpan: 2 },
    {
      name: 'category',
      label: 'Category',
      type: 'select',
      required: true,
      group: 'basic',
      options: [
        { value: 'bug', label: 'Bug Report' },
        { value: 'idea', label: 'Feature Idea' },
        { value: 'improvement', label: 'Improvement' },
        { value: 'content-idea', label: 'Content Idea' },
      ],
    },
    { name: 'contact_email', label: 'Email (optional)', type: 'email', group: 'basic' },
  ],
  defaults: {},
  fieldGroupOrder: ['basic'],
};
