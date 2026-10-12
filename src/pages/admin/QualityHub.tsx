/** Read-only engine diagnostics. Every human decision lives in /admin. */
import { lazy, Suspense, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminTableSkeleton } from '@/components/admin/primitives/AdminLoading';

const panels = [
  {
    key: 'cities',
    label: 'Cities',
    component: lazy(() =>
      import('@/components/admin/CityQualityPanel').then((m) => ({ default: m.CityQualityPanel })),
    ),
  },
  {
    key: 'venues',
    label: 'Venues: amenities and accessibility',
    component: lazy(() =>
      import('@/components/admin/AmenityQualityPanel').then((m) => ({
        default: m.AmenityQualityPanel,
      })),
    ),
  },
  {
    key: 'villages',
    label: 'Queer villages',
    component: lazy(() =>
      import('@/components/admin/VillageQualityPanel').then((m) => ({
        default: m.VillageQualityPanel,
      })),
    ),
  },
  {
    key: 'personalities',
    label: 'Personalities',
    component: lazy(() =>
      import('@/components/admin/PersonalityQualityPanel').then((m) => ({
        default: m.PersonalityQualityPanel,
      })),
    ),
  },
  {
    key: 'marketplace',
    label: 'Marketplace',
    component: lazy(() =>
      import('@/components/admin/MarketplaceQualityStatsPanel').then((m) => ({
        default: m.MarketplaceQualityStatsPanel,
      })),
    ),
  },
  {
    key: 'addresses',
    label: 'Address coverage',
    component: lazy(() =>
      import('@/components/admin/GeoAddressQualityPanel').then((m) => ({
        default: m.GeoAddressQualityPanel,
      })),
    ),
  },
  {
    key: 'categories',
    label: 'Category coverage',
    component: lazy(() =>
      import('@/components/admin/CategoryCoveragePanel').then((m) => ({
        default: m.CategoryCoveragePanel,
      })),
    ),
  },
  {
    key: 'tags',
    label: 'Tag quality',
    component: lazy(() =>
      import('@/components/admin/TagQualityPanel').then((m) => ({ default: m.TagQualityPanel })),
    ),
  },
  {
    key: 'vocabulary',
    label: 'Vocabulary health',
    component: lazy(() =>
      import('@/components/admin/TagVocabularyHealthPanel').then((m) => ({
        default: m.TagVocabularyHealthPanel,
      })),
    ),
  },
  {
    key: 'hygiene',
    label: 'Tag hygiene',
    component: lazy(() =>
      import('@/components/admin/TagHygienePanel').then((m) => ({ default: m.TagHygienePanel })),
    ),
  },
];
function EngineDiagnostics() {
  const [active, setActive] = useState('');
  return (
    <div>
      <AdminPageHeader
        title="Engine diagnostics"
        subtitle="Coverage and quality measurements. Review pending decisions in the Review queue."
        actions={
          <Button asChild variant="outline">
            <Link to="/admin">Open Review queue</Link>
          </Button>
        }
      />
      <Button asChild variant="ghost" className="mb-4">
        <Link to="/admin/editorial-tools">Editorial generation and covers</Link>
      </Button>
      <Accordion type="single" collapsible value={active} onValueChange={setActive}>
        {panels.map(({ key, label, component: Panel }) => (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger>{label}</AccordionTrigger>
            <AccordionContent>
              {active === key && (
                <Suspense fallback={<AdminTableSkeleton />}>
                  <Panel />
                </Suspense>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

const OperationalOverview = lazy(() => import('./AdminOperationalOverview'));

/** One secondary diagnostics destination; all decisions remain in Review. */
export default function QualityHub() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'engines' ? 'engines' : 'overview';
  return (
    <Tabs
      value={view}
      onValueChange={(next) =>
        setParams((current) => {
          const updated = new URLSearchParams(current);
          if (next === 'overview') updated.delete('view');
          else updated.set('view', next);
          return updated;
        })
      }
    >
      <TabsList aria-label="Diagnostics sections" className="mb-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="engines">Engines</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <Suspense fallback={<AdminTableSkeleton />}>
          <OperationalOverview />
        </Suspense>
      </TabsContent>
      <TabsContent value="engines">
        <EngineDiagnostics />
      </TabsContent>
    </Tabs>
  );
}
