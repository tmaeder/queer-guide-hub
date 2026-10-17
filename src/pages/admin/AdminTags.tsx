import { TaxonomyDirectory } from '@/components/admin/TaxonomyDirectory';
import { lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ContentListPanel } from '@/components/cms/ContentListPanel';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { AdminTableSkeleton } from '@/components/admin/primitives/AdminLoading';
import { useGranularRoles } from '@/hooks/useGranularRoles';
import { roleAtLeast } from '@/config/adminRoles';

const TagCollectionTools = lazy(() => import('@/components/admin/TagCollectionTools'));

export default function AdminTags() {
  const [params, setParams] = useSearchParams();
  const { effectiveRole } = useGranularRoles();
  const canManage = roleAtLeast(effectiveRole, 'moderator');
  const requested = params.get('section');
  const section =
    canManage && (requested === 'tools' || requested === 'vocabularies') ? requested : 'tags';
  const sections = canManage
    ? [
        ['tags', 'Tags'],
        ['tools', 'Categories & tools'],
        ['vocabularies', 'Taxonomies'],
      ]
    : [['tags', 'Tags']];

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Tag workspace"
        className="flex items-center gap-2 overflow-x-auto border-b border-border pb-2"
      >
        {sections.map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            className="shrink-0"
            variant={section === key ? 'default' : 'outline'}
            aria-current={section === key ? 'page' : undefined}
            onClick={() => {
              const next = new URLSearchParams(params);
              if (key === 'tags') next.delete('section');
              else next.set('section', key);
              setParams(next);
            }}
          >
            {label}
          </Button>
        ))}
        {canManage && (
          <Button asChild variant="ghost" size="sm" className="ml-auto shrink-0">
            <Link to="/admin/governance?mode=tags">Tag governance</Link>
          </Button>
        )}
      </nav>
      {section === 'tags' && <ContentListPanel contentTypeId="unified_tags" />}
      {section === 'tools' && (
        <>
          <AdminArchetypeHeader title="Categories & tools" />
          <Suspense fallback={<AdminTableSkeleton />}>
            <TagCollectionTools />
          </Suspense>
        </>
      )}
      {section === 'vocabularies' && <TaxonomyDirectory />}
    </div>
  );
}
