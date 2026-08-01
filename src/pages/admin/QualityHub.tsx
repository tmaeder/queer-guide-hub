import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  Link2,
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
import { OrgLinkReviewQueue } from '@/components/admin/business/OrgLinkReviewQueue';
import { GeoAddressQualityPanel } from '@/components/admin/GeoAddressQualityPanel';
import type { FreigabeStufe } from '@/lib/personalityStatus';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

interface QualityEngine {
  /** get_admin_counts key for pending review items; null = engine has no gate. */
  countKey: string | null;
  title: string;
  description: string;
  /** Where the card navigates. null when the gate is reviewed inline via `section`. */
  route: string | null;
  /** EngineSection.value to expand in place instead of navigating. */
  section?: string;
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
    countKey: 'review_org_links',
    title: 'Business links',
    description:
      'Ambiguous entity→business matches and brand mint proposals from the nightly spine backfill.',
    route: null,
    section: 'business-links',
    icon: Link2,
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
    editRoute: '/admin/content/queer_villages',
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
  {
    /* Reviewed inline rather than in the inbox: approving a suggestion picks a
       target org, and with none set decide_org_adoption mints a new one —
       inputs the generic triage panel does not model. */
    value: 'business-links',
    title: 'Business links — adoption review',
    editRoute: '/admin/business',
    editLabel: 'Open Business console',
    render: () => <OrgLinkReviewQueue />,
  },
  {
    /* Cross-type rather than per-entity: state/postal/country share one derive
       trigger and one queue, so the gaps only make sense side by side. */
    value: 'addresses',
    title: 'Addresses — state, postal code & country',
    editRoute: '/admin/geography',
    editLabel: 'Open Geography',
    render: () => <GeoAddressQualityPanel />,
  },
];

const CARD_CLASS =
  'flex flex-col gap-2 rounded-container border border-border p-4 text-left transition-colors hover:bg-muted/40';

/** Card face, identical whether the card navigates or expands a section below. */
function EngineCardBody({
  engine,
  pending,
}: {
  engine: QualityEngine;
  pending: number | undefined;
}) {
  const Icon = engine.icon;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          <Icon size={16} />
          {engine.title}
        </span>
        {engine.countKey === null ? (
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
      <p className="text-13 text-muted-foreground">{engine.description}</p>
      {engine.countKey !== null && pending != null && pending > 0 && (
        <p className="text-13 font-medium">
          Review {pending} item{pending === 1 ? '' : 's'} →
        </p>
      )}
    </>
  );
}

/**
 * Quality hub — one page surfacing every Truth Engine review gate with its
 * pending count (gates deep-link into the unified inbox queues) plus the
 * per-engine dashboard panels that used to live on the standalone
 * /admin/content/<entity>-quality pages.
 */
export default function QualityHub() {
  const { data: counts } = useAdminCounts();
  const [openSections, setOpenSections] = useState<string[]>(['personalities']);
  const pendingScroll = useRef<string | null>(null);
  const totalPending = ENGINES.reduce(
    (sum, e) => sum + (e.countKey ? (counts?.[e.countKey] ?? 0) : 0),
    0,
  );

  /** Expand an inline gate's section and bring it into view. */
  const revealSection = (value: string) => {
    // Already open: the state never changes, so the effect below would not
    // fire and the card would look dead on a second click. Scroll directly.
    if (openSections.includes(value)) {
      document.getElementById(`section-${value}`)?.scrollIntoView({ block: 'start' });
      return;
    }
    setOpenSections((prev) => [...prev, value]);
    pendingScroll.current = value;
  };

  // Scroll once the accordion has committed. Scheduling this from the click
  // handler (rAF) races the expansion and silently no-ops. Expanding a section
  // does not move its own top, so no settle logic is needed — but collapsing
  // the others would (it shrinks the page enough to clamp the scroll), which
  // is why revealSection only ever adds.
  useEffect(() => {
    const value = pendingScroll.current;
    if (!value) return;
    pendingScroll.current = null;
    document.getElementById(`section-${value}`)?.scrollIntoView({ block: 'start' });
  }, [openSections]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      {/* mb-0: the parent already spaces children with gap-6. */}
      <AdminPageHeader
        className="mb-0"
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck size={22} aria-hidden />
            Quality
          </span>
        }
        subtitle={
          <>
            Truth Engine review gates and dashboards. Review happens in the inbox.{' '}
            {counts
              ? `${totalPending} item${totalPending === 1 ? '' : 's'} awaiting review.`
              : 'Loading counts…'}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ENGINES.map((e) => {
          const pending = e.countKey ? counts?.[e.countKey] : undefined;
          const body = <EngineCardBody engine={e} pending={pending} />;
          return e.route ? (
            <Link key={e.title} to={e.route} className={CARD_CLASS}>
              {body}
            </Link>
          ) : (
            <button
              key={e.title}
              type="button"
              className={CARD_CLASS}
              onClick={() => e.section && revealSection(e.section)}
            >
              {body}
            </button>
          );
        })}
      </div>

      <div>
        <h2 className="text-title">Engine dashboards</h2>
        <p className="text-13 text-muted-foreground">
          Coverage, completeness, and funnel stats per Truth Engine.
        </p>
      </div>
      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
        {SECTIONS.map((s) => (
          <AccordionItem key={s.value} id={`section-${s.value}`} value={s.value}>
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
