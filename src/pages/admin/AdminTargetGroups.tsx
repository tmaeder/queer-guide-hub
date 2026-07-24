import {
  TaxonomyAdminPage,
  type TaxonomyPageConfig,
  type TaxonomyRowBase,
} from '@/components/admin/taxonomy/TaxonomyAdminPage';

interface TargetGroupRow extends TaxonomyRowBase {
  description: string | null;
  icon: string | null;
  color: string;
}

const config: TaxonomyPageConfig<TargetGroupRow> = {
  table: 'target_groups',
  title: 'Target Groups',
  subtitle: 'Manage LGBTQ+ community target groups',
  entityLabel: 'Target Group',
  toastNoun: 'Target group',
  select: 'id,name,description,icon,color,sort_order,is_active,created_at',
  nameColumn: { colorDot: 'full' },
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '' },
    { key: 'description', label: 'Description', type: 'textarea', default: '' },
    { key: 'icon', label: 'Icon', type: 'text', default: '', placeholder: 'Lucide name' },
    { key: 'color', label: 'Color', type: 'color', default: 'hsl(var(--muted-foreground))' },
    { key: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
    { key: 'is_active', label: 'Active', type: 'switch', default: true },
  ],
  formLayout: ['name', 'description', ['icon', 'color', 'sort_order'], 'is_active'],
};

export default function AdminTargetGroups() {
  return <TaxonomyAdminPage config={config} />;
}
