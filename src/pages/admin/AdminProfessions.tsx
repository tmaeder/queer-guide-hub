import { createColumnHelper } from '@tanstack/react-table';
import {
  TaxonomyAdminPage,
  type TaxonomyPageConfig,
  type TaxonomyRowBase,
} from '@/components/admin/taxonomy/TaxonomyAdminPage';
import type { AdminColumnMeta } from '@/components/admin/data-table/types';

interface ProfessionRow extends TaxonomyRowBase {
  description: string | null;
  category: string | null;
  aliases: string[] | null;
  icon: string | null;
  color: string;
}

const columnHelper = createColumnHelper<ProfessionRow>();

const config: TaxonomyPageConfig<ProfessionRow> = {
  table: 'professions',
  title: 'Professions',
  subtitle: 'Manage profession labels for personalities',
  entityLabel: 'Profession',
  toastNoun: 'Profession',
  toastStyle: 'plain',
  select: 'id,name,description,category,aliases,icon,color,is_active,sort_order,created_at',
  nameColumn: { colorDot: 'badge' },
  extraColumns: [
    columnHelper.accessor((row) => row.category ?? '', {
      id: 'category',
      header: 'Category',
      cell: (info) => info.getValue() || '-',
      meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
    }),
    columnHelper.accessor((row) => String((row.aliases ?? []).length), {
      id: 'aliases',
      header: 'Aliases',
      cell: (info) => (
        <span className="text-muted-foreground">{(info.row.original.aliases ?? []).length}</span>
      ),
      meta: { hideable: true } satisfies AdminColumnMeta,
    }),
  ],
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, default: '' },
    {
      key: 'category',
      label: 'Category',
      type: 'text',
      default: '',
      nullWhenEmpty: true,
      placeholder: 'Performance, Arts, Media, Sports…',
    },
    {
      key: 'aliases',
      label: 'Aliases (comma-separated)',
      type: 'aliases',
      default: '',
      placeholder: 'singer-songwriter, vocalist',
    },
    { key: 'description', label: 'Description', type: 'textarea', default: '' },
    { key: 'icon', label: 'Icon', type: 'text', default: '', placeholder: 'Lucide name' },
    { key: 'color', label: 'Color', type: 'color', default: 'hsl(var(--muted-foreground))' },
    { key: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
    { key: 'is_active', label: 'Active', type: 'switch', default: true },
  ],
  formLayout: [
    'name',
    'category',
    'aliases',
    'description',
    ['icon', 'color', 'sort_order'],
    'is_active',
  ],
};

export default function AdminProfessions() {
  return <TaxonomyAdminPage config={config} />;
}
