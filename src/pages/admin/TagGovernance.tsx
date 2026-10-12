import { lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { AdminTableSkeleton } from '@/components/admin/primitives/AdminLoading';

const Quality = lazy(() =>
  import('@/components/admin/TagQualityPanel').then((m) => ({ default: m.TagQualityPanel })),
);
const VocabularyHealth = lazy(() =>
  import('@/components/admin/TagVocabularyHealthPanel').then((m) => ({
    default: m.TagVocabularyHealthPanel,
  })),
);
const Hygiene = lazy(() =>
  import('@/components/admin/TagHygienePanel').then((m) => ({ default: m.TagHygienePanel })),
);
const SensitiveReview = lazy(() =>
  import('@/components/admin/SensitiveTagReviewPanel').then((m) => ({
    default: m.SensitiveTagReviewPanel,
  })),
);
const Suggestions = lazy(() =>
  import('@/components/admin/TagSuggestionsReviewPanel').then((m) => ({
    default: m.TagSuggestionsReviewPanel,
  })),
);

const SECTIONS = [
  { key: 'sensitive', label: 'Sensitive tags awaiting review', component: SensitiveReview },
  { key: 'suggestions', label: 'Enrichment suggestions', component: Suggestions },
  { key: 'quality', label: 'Tag quality', component: Quality },
  { key: 'vocabulary', label: 'Vocabulary health', component: VocabularyHealth },
  { key: 'hygiene', label: 'Tag hygiene', component: Hygiene },
];

export default function TagGovernance() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tagPanel');
  const active = SECTIONS.some((s) => s.key === requested) ? requested! : '';
  return (
    <div className="flex flex-col gap-6">
      <AdminArchetypeHeader
        title="Tag governance"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/content/unified_tags">Edit tags</Link>
          </Button>
        }
      />
      <p className="max-w-2xl text-15 text-muted-foreground">
        Review tag decisions and check vocabulary health. Open a section to focus on that work.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/governance?mode=triage&queue=tags">Review tag assignments</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/governance?mode=merge&family=taxonomy">
            Review tag & vocabulary merges
          </Link>
        </Button>
      </div>
      <Accordion
        type="single"
        collapsible
        value={active}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          if (value) next.set('tagPanel', value);
          else next.delete('tagPanel');
          setParams(next);
        }}
      >
        {SECTIONS.map(({ key, label, component: Panel }) => (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger className="text-15">{label}</AccordionTrigger>
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
