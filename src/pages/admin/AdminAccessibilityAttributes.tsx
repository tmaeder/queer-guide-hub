import { TaxonomyAdminPage } from '@/components/admin/taxonomy/TaxonomyAdminPage';
import {
  categoryBadgeColumn,
  type TaxonomyPageConfig,
  type TaxonomyRowBase,
} from '@/components/admin/taxonomy/taxonomyConfig';

interface AccessibilityRow extends TaxonomyRowBase {
  description: string | null;
  icon: string | null;
  category: string;
}

const categories = [
  { value: 'general', label: 'General' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'visual', label: 'Visual' },
  { value: 'hearing', label: 'Hearing' },
  { value: 'sensory', label: 'Sensory' },
];

const config: TaxonomyPageConfig<AccessibilityRow> = {
  table: 'accessibility_attributes',
  title: 'Accessibility Attributes',
  subtitle: 'Manage accessibility features and attributes',
  entityLabel: 'Attribute',
  toastNoun: 'Attribute',
  select: 'id,name,description,icon,category,sort_order,is_active,created_at',
  orderColumnDefaultVisible: false,
  extraColumns: [categoryBadgeColumn<AccessibilityRow>({ alwaysBadge: true })],
  entityFilters: [
    { key: 'category', label: 'Category', type: 'select', column: 'category', options: categories },
    { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
  ],
  bulkEditFields: [
    { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
    { key: 'category', label: 'Category', type: 'select', column: 'category', options: categories },
  ],
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '' },
    { key: 'description', label: 'Description', type: 'textarea', default: '' },
    { key: 'icon', label: 'Icon', type: 'text', default: '', placeholder: 'Lucide name' },
    { key: 'category', label: 'Category', type: 'select', default: 'general', options: categories },
    { key: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
    { key: 'is_active', label: 'Active', type: 'switch', default: true },
  ],
  formLayout: ['name', 'description', ['icon', 'category', 'sort_order'], 'is_active'],
};

export default function AdminAccessibilityAttributes() {
  return <TaxonomyAdminPage config={config} />;
}
