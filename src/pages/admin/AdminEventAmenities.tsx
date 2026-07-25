import { TaxonomyAdminPage } from '@/components/admin/taxonomy/TaxonomyAdminPage';
import {
  categoryBadgeColumn,
  type TaxonomyPageConfig,
  type TaxonomyRowBase,
} from '@/components/admin/taxonomy/taxonomyConfig';

interface EventAmenityRow extends TaxonomyRowBase {
  description: string | null;
  icon: string | null;
  category: string | null;
}

const categories = ['Technology', 'Accessibility', 'Comfort', 'Food & Beverage', 'Services'];
const categoryOptions = categories.map((c) => ({ value: c, label: c }));

const config: TaxonomyPageConfig<EventAmenityRow> = {
  table: 'event_amenities',
  title: 'Event Amenities',
  subtitle: 'Manage event amenities and features',
  entityLabel: 'Amenity',
  toastNoun: 'Event amenity',
  select: 'id,name,description,icon,category,is_active,sort_order,created_at',
  showDescriptionColumn: false,
  orderColumnDefaultVisible: false,
  extraColumns: [categoryBadgeColumn<EventAmenityRow>()],
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

export default function AdminEventAmenities() {
  return <TaxonomyAdminPage config={config} />;
}
