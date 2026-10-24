import { ListTree } from 'lucide-react';
import type { ContentTypeConfig } from '@/types/cms';
export const config: ContentTypeConfig = {
  id: 'example',
  tableName: 'example',
  primaryKey: 'id',
  titleField: 'name',
  label: { singular: 'Example', plural: 'Examples' },
  color: '',
  icon: ListTree,
  defaults: { active: false },
  writeCreatedBy: false,
  fields: [
    { name: 'name', label: 'Name', type: 'text', group: 'basic', required: true },
    { name: 'slug', label: 'Slug', type: 'text', group: 'basic', immutable: true },
    { name: 'description', label: 'Description', type: 'textarea', group: 'basic' },
    { name: 'active', label: 'Active', type: 'boolean', group: 'basic' },
    { name: 'amount', label: 'Amount', type: 'number', group: 'basic', min: 0 },
    { name: 'secret', label: 'Secret', type: 'text', group: 'basic', hidden: true },
    { name: 'computed', label: 'Computed', type: 'text', group: 'basic', virtual: true },
    { name: 'created_at', label: 'Created', type: 'datetime', group: 'basic' },
    { name: 'readonly', label: 'Read only', type: 'text', group: 'basic', readOnly: true },
  ],
};
