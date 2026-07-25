import {
  TaxonomyAdminPage,
  type TaxonomyPageConfig,
  type TaxonomyRowBase,
} from '@/components/admin/taxonomy/TaxonomyAdminPage';

interface CategoryRow extends TaxonomyRowBase {
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
}

const config: TaxonomyPageConfig<CategoryRow> = {
  table: 'venue_categories',
  title: 'Venue Categories',
  subtitle: 'Manage venue categories and organization types',
  entityLabel: 'Category',
  toastNoun: 'Category',
  toastStyle: 'plain',
  select: 'id,name,slug,description,icon,color,sort_order,is_active,created_at',
  dialogMaxWidth: 560,
  searchColumns: ['name', 'slug'],
  nameColumn: { colorDot: 'badge', showSlug: true },
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '' },
    { key: 'slug', label: 'Slug', type: 'slug', required: true, default: '' },
    { key: 'description', label: 'Description', type: 'textarea', default: '' },
    { key: 'icon', label: 'Icon', type: 'text', default: '', placeholder: 'Lucide name' },
    { key: 'color', label: 'Color', type: 'color', default: 'hsl(var(--muted-foreground))' },
    { key: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
    { key: 'is_active', label: 'Active', type: 'switch', default: true },
  ],
  formLayout: [['name', 'slug'], 'description', ['icon', 'color', 'sort_order'], 'is_active'],
};

export default function AdminVenueCategories() {
  return <TaxonomyAdminPage config={config} />;
}
