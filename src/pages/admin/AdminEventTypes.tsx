import {
  TaxonomyAdminPage,
  type TaxonomyPageConfig,
  type TaxonomyRowBase,
} from '@/components/admin/taxonomy/TaxonomyAdminPage';

interface EventTypeRow extends TaxonomyRowBase {
  description: string | null;
  icon: string | null;
  color: string;
}

const config: TaxonomyPageConfig<EventTypeRow> = {
  table: 'event_types',
  title: 'Event Types',
  subtitle: 'Manage event type classifications',
  entityLabel: 'Event Type',
  toastNoun: 'Event type',
  select: 'id,name,description,icon,color,is_active,sort_order,created_at',
  nameColumn: { colorDot: 'badge' },
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

export default function AdminEventTypes() {
  return <TaxonomyAdminPage config={config} />;
}
