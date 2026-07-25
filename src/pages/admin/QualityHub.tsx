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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAdminCounts } from '@/hooks/useAdminCounts';

interface QualityEngine {
  /** get_admin_counts key for pending review items; null = engine has no gate. */
  countKey: string | null;
  title: string;
  description: string;
  route: string;
  icon: LucideIcon;
}

const ENGINES: QualityEngine[] = [
  {
    countKey: 'quality_city',
    title: 'Cities',
    description: 'Safety notes, ratings, and hooks. Criminalizing destinations stay human-gated.',
    route: '/admin/content/city-quality',
    icon: MapPin,
  },
  {
    countKey: 'quality_venue',
    title: 'Venues',
    description: 'Amenity vocabulary and accessibility claims. Accessibility is always review-gated.',
    route: '/admin/content/venue-quality',
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
    route: '/admin/content/personality-quality',
    icon: Users,
  },
  {
    countKey: 'quality_marketplace',
    title: 'Marketplace',
    description: 'Content-rating downgrades. Wrong-SFW never applies without approval.',
    route: '/admin/content/marketplace-quality',
    icon: ShoppingBag,
  },
  {
    countKey: 'quality_village',
    title: 'Queer Villages',
    description: 'Grounded LLM rewrites of history, descriptions, and landmarks.',
    route: '/admin/content/village-quality',
    icon: Home,
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
    route: '/admin/places-editorial',
    icon: PenLine,
  },
];

/**
 * Quality hub — one page surfacing every Truth Engine review gate with its
 * pending count. The engines themselves stay at their deep-link routes; this
 * makes their hidden work visible without eight sidebar rows.
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
          Truth Engine dashboards and their review gates.{' '}
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
            </Link>
          );
        })}
      </div>
    </div>
  );
}
