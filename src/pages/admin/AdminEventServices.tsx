import { TaxonomyAdminPage } from '@/components/admin/taxonomy/TaxonomyAdminPage';
import {
  categoryBadgeColumn,
  type TaxonomyPageConfig,
  type TaxonomyRowBase,
} from '@/components/admin/taxonomy/taxonomyConfig';

interface EventServiceRow extends TaxonomyRowBase {
  description: string | null;
  icon: string | null;
  category: string | null;
}

const categories = [
  'Planning',
  'Administration',
  'Technology',
  'Communication',
  'Safety',
  'Documentation',
  'Aesthetics',
  'Maintenance',
  'Logistics',
];
const categoryOptions = categories.map((c) => ({ value: c, label: c }));

const config: TaxonomyPageConfig<EventServiceRow> = {
  table: 'event_services',
  title: 'Event Services',
  subtitle: 'Manage event services and offerings',
  entityLabel: 'Service',
  toastNoun: 'Event service',
  select: 'id,name,description,icon,category,is_active,sort_order,created_at',
  showDescriptionColumn: false,
  orderColumnDefaultVisible: false,
  extraColumns: [categoryBadgeColumn<EventServiceRow>()],
  entityFilters: [
    { key: 'category', label: 'Category', type: 'select', column: 'category', options: categoryOptions },
    { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
  ],
  bulkEditFields: [{ key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' }],
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '' },
    { key: 'description', label: 'Description', type: 'textarea', default: '' },
    { key: 'icon', label: 'Icon', type: 'text', default: '', placeholder: 'Lucide name' },
    {
      key: 'category',
      label: 'Category',
      type: 'select',
      default: '',
      options: categoryOptions,
      selectPlaceholder: 'Select',
    },
    { key: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
    { key: 'is_active', label: 'Active', type: 'switch', default: true },
  ],
  formLayout: ['name', 'description', ['icon', 'category', 'sort_order'], 'is_active'],
};

export default function AdminEventServices() {
  return <TaxonomyAdminPage config={config} />;
}
