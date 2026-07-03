import { TaxonomyAdminPage } from '@/components/admin/taxonomy/TaxonomyAdminPage';
import {
  categoryBadgeColumn,
  type TaxonomyPageConfig,
  type TaxonomyRowBase,
} from '@/components/admin/taxonomy/taxonomyConfig';

interface ServiceRow extends TaxonomyRowBase {
  slug: string;
  description: string | null;
  icon: string | null;
  category: string | null;
}

const serviceCategories = [
  'general',
  'beauty',
  'business',
  'dining',
  'entertainment',
  'events',
  'fitness',
  'professional',
  'retail',
  'wellness',
];

const categoryOptions = serviceCategories.map((c) => ({
  value: c,
  label: c.charAt(0).toUpperCase() + c.slice(1),
}));

const config: TaxonomyPageConfig<ServiceRow> = {
  table: 'venue_services',
  title: 'Venue Services',
  subtitle: 'Manage venue services and offerings',
  entityLabel: 'Service',
  toastNoun: 'Service',
  toastStyle: 'plain',
  select: 'id,name,slug,description,icon,category,sort_order,is_active,created_at',
  dialogMaxWidth: 560,
  searchColumns: ['name', 'slug'],
  nameColumn: { showSlug: true },
  showDescriptionColumn: false,
  orderColumnDefaultVisible: false,
  extraColumns: [categoryBadgeColumn<ServiceRow>()],
  entityFilters: [
    { key: 'category', label: 'Category', type: 'select', column: 'category', options: categoryOptions },
    { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
  ],
  bulkEditFields: [
    { key: 'is_active', label: 'Active', type: 'boolean', column: 'is_active' },
    { key: 'category', label: 'Category', type: 'select', column: 'category', options: categoryOptions },
  ],
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '' },
    { key: 'slug', label: 'Slug', type: 'slug', default: '' },
    { key: 'description', label: 'Description', type: 'textarea', rows: 2, default: '' },
    { key: 'icon', label: 'Icon', type: 'text', default: '', placeholder: 'Lucide name' },
    { key: 'category', label: 'Category', type: 'select', default: 'general', options: categoryOptions },
    { key: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
    { key: 'is_active', label: 'Active', type: 'switch', default: true },
  ],
  formLayout: [
    ['name', 'slug'],
    'description',
    ['icon', 'category', 'sort_order'],
    'is_active',
  ],
};

export default function AdminVenueServices() {
  return <TaxonomyAdminPage config={config} />;
}
