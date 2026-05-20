import { UsersRound } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

export const groupFields: FieldConfig[] = [
  {
    name: 'name',
    label: 'Group Name',
    type: 'text',
    required: true,
    group: 'basic',
    searchable: true,
    sortable: true,
  },
  { name: 'description', label: 'Description', type: 'richtext', group: 'basic', colSpan: 2 },
  { name: 'rules', label: 'Group Rules', type: 'textarea', group: 'details', colSpan: 2 },
  { name: 'tags', label: 'Tags', type: 'tags', group: 'details' },
  { name: 'image_url', label: 'Group Image', type: 'image', group: 'media' },
  { name: 'is_private', label: 'Private Group', type: 'boolean', group: 'settings' },
  {
    name: 'member_count',
    label: 'Member Count',
    type: 'number',
    group: 'settings',
    readOnly: true,
    sortable: true,
  },
];

export const communityGroupsContentType: ContentTypeConfig = {
  id: 'community_groups',
  tableName: 'community_groups',
  primaryKey: 'id',
  titleField: 'name',
  descriptionField: 'description',
  imageField: 'image_url',
  icon: UsersRound,
  label: { singular: 'Group', plural: 'Groups' },
  color: 'hsl(var(--foreground))',
  fields: groupFields,
  defaults: { is_private: false },
  fieldGroupOrder: ['basic', 'details', 'media', 'settings'],
};
