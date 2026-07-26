import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  MapPin,
  Building,
  Calendar,
  Users,
  ShoppingBag,
  Home,
  Flag,
  PenLine,
  ShieldCheck,
  GitMerge,
  Table2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useAdminCounts } from '@/hooks/useAdminCounts';
import { CityQualityPanel } from '@/components/admin/CityQualityPanel';
import { AmenityQualityPanel } from '@/components/admin/AmenityQualityPanel';
import { VillageQualityPanel } from '@/components/admin/VillageQualityPanel';
import { PersonalityQualityPanel } from '@/components/admin/PersonalityQualityPanel';
import { MarketplaceTagQualityPanel } from '@/components/admin/MarketplaceTagQualityPanel';
import { MarketplacePruneCard } from '@/components/admin/MarketplacePruneCard';
import { FreigabeFunnel } from '@/components/admin/FreigabeFunnel';
import { PersonalityFreigabeQueue } from '@/components/admin/PersonalityFreigabeQueue';
import { DedupPendingLink } from '@/components/admin/DedupPendingLink';
import type { FreigabeStufe } from '@/lib/personalityStatus';

interface QualityEngine {
  /** get_admin_counts key for pending review items; null = engine has no gate. */
  countKey: string | null;
  title: string;
  description: string;
  route: string;
  icon: LucideIcon;
}

/** Review actions live in the unified inbox; each gated engine deep-links to its queue. */
const ENGINES: QualityEngine[] = [
  {
    countKey: 'quality_city',
    title: 'Cities',
    description: 'Safety notes, ratings, and hooks. Criminalizing destinations stay human-gated.',
    route: '/admin/inbox?queue=quality-city',
    icon: MapPin,
  },
  {
    countKey: 'quality_venue',
    title: 'Venues',
    description: 'Amenity vocabulary and accessibility claims. Accessibility is always review-gated.',
    route: '/admin/inbox?queue=quality-venue',
    icon: Building,
  },
  {
    countKey: null,
    title: 'Events',
    description: 'Trust scores, liveness checks, and coverage gaps. No review gate.',
    route: '/admin/content/event-quality',
    icon: Calendar,
  },
  {
    countKey: 'quality_personality',
    title: 'Personalities',
    description: 'LLM-proposed identity fields and adult-cohort consent publishing.',
    route: '/admin/inbox?queue=quality-personality',
    icon: Users,
  },
  {
    countKey: 'quality_marketplace',
    title: 'Marketplace',
    description: 'Content-rating downgrades. Wrong-SFW never applies without approval.',
    route: '/admin/inbox?queue=quality-marketplace',
    icon: ShoppingBag,
  },
  {
    countKey: 'quality_village',
    title: 'Queer Villages',
    description: 'Grounded LLM rewrites of history, descriptions, and landmarks.',
    route: '/admin/inbox?queue=quality-village',
    icon: Home,
  },
  {
    countKey: 'quality_duplicates',
    title: 'Duplicates',
    description: 'Nightly identity sweep. Exact-key merges are automatic; ambiguous pairs wait here.',
    route: '/admin/inbox?queue=dedup-review',
    icon: GitMerge,
  },
  {
    countKey: 'quality_existence',
    title: 'Liveness & closure',
    description: 'Existence Engine: flagged dead entities awaiting archive review.',
    route: '/admin/content/liveness',
    icon: Flag,
  },
  {
    countKey: 'quality_editorial',
    title: 'Editorial drafts',
    description: 'Country editorial hooks and paragraphs awaiting approval.',
    route: '/admin/inbox?queue=editorial',
    icon: PenLine,
  },
];

/** One engine dashboard section: edit link + panels + dedup cross-link. */
interface EngineSection {
  value: string;
  title: string;
  editRoute: string;
  editLabel: string;
  render: () => ReactNode;
}

/** Freigabe funnel + queue are deliberately separate from the review gates and
 *  stay reachable here (multi-stage Ampel, not an inbox queue). */
function PersonalitySection() {
  const [stage, setStage] = useState<FreigabeStufe>('in_pruefung');
  return (
    <>
      <FreigabeFunnel selected={stage} onSelect={setStage} />
      <PersonalityFreigabeQueue stage={stage} onStageChange={setStage} />
      <PersonalityQualityPanel />
      <DedupPendingLink entityType="personality" />
    </>
  );
}

const SECTIONS: EngineSection[] = [
  {
    value: 'cities',
    title: 'Cities',
    editRoute: '/admin/content/cities',
    editLabel: 'Edit cities',
    render: () => (
      <>
        <CityQualityPanel />
        <DedupPendingLink entityType="city" />
      </>
    ),
  },
  {
    value: 'venues',
    title: 'Venues — amenities & accessibility',
    editRoute: '/admin/content/venues',
    editLabel: 'Edit venues',
    render: () => (
      <>
        <AmenityQualityPanel />
        <DedupPendingLink entityType="venue" />
      </>
    ),
  },
  {
    value: 'villages',
    title: 'Queer Villages',
    editRoute: '/admin/villages',
    editLabel: 'Edit villages',
    render: () => (
      <>
        <VillageQualityPanel />
        <DedupPendingLink entityType="queer_village" />
      </>
    ),
  },
  {
    value: 'personalities',
    title: 'Personalities — Freigabe & completeness',
    editRoute: '/admin/content/personalities',
    editLabel: 'Edit personalities',
    render: () => <PersonalitySection />,
  },
  {
    value: 'marketplace',
    title: 'Marketplace tags',
    editRoute: '/admin/content/marketplace_listings',
    editLabel: 'Edit listings',
    render: () => (
      <>
        <MarketplacePruneCard />
        <MarketplaceTagQualityPanel />
        <DedupPendingLink entityType="marketplace" />
      </>
    ),
  },
];

/**
 * Quality hub — one page surfacing every Truth Engine review gate with its
 * pending count (gates deep-link into the unified inbox queues) plus the
 * per-engine dashboard panels that used to live on the standalone
 * /admin/content/<entity>-quality pages.
 */
export default function QualityHub() {
  const { data: counts } = useAdminCounts();
  const totalPending = ENGINES.reduce(
    (sum, e) => sum + (e.countKey ? (counts?.[e.countKey] ?? 0) : 0),
    0,
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-headline">
          <ShieldCheck size={22} />
          Quality
        </h1>
        <p className="text-13 text-muted-foreground">
          Truth Engine review gates and dashboards. Review happens in the inbox.{' '}
          {counts
            ? `${totalPending} item${totalPending === 1 ? '' : 's'} awaiting review.`
            : 'Loading counts…'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ENGINES.map((e) => {
          const pending = e.countKey ? counts?.[e.countKey] : undefined;
          const Icon = e.icon;
          return (
            <Link
              key={e.route}
              to={e.route}
              className="flex flex-col gap-2 rounded-container border border-border p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  <Icon size={16} />
                  {e.title}
                </span>
                {e.countKey === null ? (
                  <Badge variant="outline" className="font-normal">
                    no gate
                  </Badge>
                ) : pending != null && pending > 0 ? (
                  <Badge className="tabular-nums">{pending}</Badge>
                ) : (
                  <Badge variant="secondary" className="font-normal tabular-nums">
                    {pending ?? '…'}
                  </Badge>
                )}
              </div>
              <p className="text-13 text-muted-foreground">{e.description}</p>
              {e.countKey !== null && pending != null && pending > 0 && (
                <p className="text-13 font-medium">
                  Review {pending} item{pending === 1 ? '' : 's'} →
                </p>
              )}
            </Link>
          );
        })}
      </div>

      <div>
        <h2 className="text-title">Engine dashboards</h2>
        <p className="text-13 text-muted-foreground">
          Coverage, completeness, and funnel stats per Truth Engine.
        </p>
      </div>
      <Accordion type="multiple" defaultValue={['personalities']}>
        {SECTIONS.map((s) => (
          <AccordionItem key={s.value} value={s.value}>
            <AccordionTrigger className="text-15">{s.title}</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-4 pt-2">
                <div>
                  <Button asChild variant="outline" size="sm">
                    <Link to={s.editRoute}>
                      <Table2 size={14} className="mr-1" /> {s.editLabel}
                    </Link>
                  </Button>
                </div>
                {s.render()}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
