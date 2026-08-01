/**
 * adminQueues — the single registry of admin review queues.
 *
 * Every queue that `get_admin_counts` emits a pending count for lives here once,
 * with the label, destination, SLA key and role floor it is rendered with. The
 * Cockpit feed and the Quality hub both read this list, so a queue cannot appear
 * on one surface with a different name or a different link than on the other
 * (before this existed, the hub deep-linked each gate into its inbox queue while
 * the cockpit's Quality Gates widget sent all seven of its rows to a bare
 * /admin/quality).
 *
 * Three details are load-bearing and not derivable, which is most of why this
 * file exists:
 *
 *  - `slaKey` is the UNPREFIXED `triage_sources.count_key`, while `countKey` is
 *    `count_prefix || count_key`. For staging that is `staging` vs
 *    `review_staging`. You cannot strip a prefix to get one from the other:
 *    the quality queues have an empty prefix, and review_feedback's SLA lives
 *    under `feedback`.
 *  - `hasOverdue` is false for the two gates the RPC computes outside the
 *    registry loop (group requests, existence audit). They emit no
 *    `<key>_overdue` companion, and `readCount` returns 0 for a missing one —
 *    indistinguishable from "nothing is overdue". Rendering an overdue marker
 *    for them would be inventing a signal.
 *  - `review_duplicates` and `quality_duplicates` are two different queues, not
 *    a naming drift: the first is the triage duplicate view (weight 20, 72h),
 *    the second is the nightly dedup sweep's review queue (weight 40, 168h).
 *
 * Links use `?queue=`, never `adminLink.review()` — that emits `?tab=`, and
 * AdminInbox's TAB_TO_QUEUE map has no entries for the quality queues, so a
 * `?tab=quality-city` link silently lands on the unscoped inbox.
 */

import {
  Bot,
  Building,
  CopyCheck,
  FileText,
  Flag,
  GitMerge,
  Home,
  Inbox,
  Link2,
  MapPin,
  MessageSquare,
  Newspaper,
  PenLine,
  ShoppingBag,
  Tag,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { roleAtLeast, type AdminRole, type EffectiveRole } from '@/config/adminRoles';
import type { AdminCounts } from '@/hooks/useAdminCounts';

/** Which admin surface renders this queue. A queue may appear on both. */
export type QueueSurface = 'cockpit' | 'quality';

export interface AdminQueueDef {
  /** `triage_sources.queue_key` — the `?queue=` value. Null for the three
   *  gates the RPC computes outside the registry loop. */
  queueKey: string | null;
  /** Exact key emitted by `get_admin_counts` (`count_prefix || count_key`). */
  countKey: string;
  /** Key inside `counts.sla_hours` — see the file header. Null when the queue
   *  has no SLA entry. */
  slaKey: string | null;
  /** Whether the RPC emits a `<countKey>_overdue` companion. */
  hasOverdue: boolean;
  /** Short row label for the cockpit feed (renders at 375px). */
  label: string;
  /** Quality hub card title. May be wordier than `label`. */
  title: string;
  /** Quality hub card body. Not rendered in the cockpit. */
  description: string;
  icon: LucideIcon;
  /** Where the cockpit row navigates. */
  route: string;
  /** Quality hub only: expand this accordion section instead of navigating. */
  section?: string;
  /** Mirrors `triage_sources.priority_weight`. Higher ranks first. */
  weight: number;
  surfaces: readonly QueueSurface[];
  /** Role floor for seeing this queue at all. */
  minRole: AdminRole;
}

const inbox = (queueKey: string) => `/admin/inbox?queue=${queueKey}`;

/**
 * Every queue `get_admin_counts` reports on: the 17 active `triage_sources`
 * rows plus the three static gates (feedback, group requests, existence audit).
 * Order here is documentation only — `rankQueueRows` sorts by urgency.
 */
export const ADMIN_QUEUES: readonly AdminQueueDef[] = [
  {
    queueKey: 'moderation',
    countKey: 'review_moderation',
    slaKey: 'moderation',
    hasOverdue: true,
    label: 'Reports',
    title: 'Reports',
    description: 'User reports on content and profiles awaiting a moderator decision.',
    icon: Flag,
    route: inbox('moderation'),
    weight: 100,
    surfaces: ['cockpit'],
    minRole: 'moderator',
  },
  {
    queueKey: 'submissions',
    countKey: 'review_submissions',
    slaKey: 'submissions',
    hasOverdue: true,
    label: 'Submissions',
    title: 'Submissions',
    description: 'Community and extension submissions waiting on a first pass.',
    icon: UsersRound,
    route: inbox('submissions'),
    weight: 80,
    surfaces: ['cockpit'],
    minRole: 'editor',
  },
  {
    queueKey: 'staging',
    countKey: 'review_staging',
    slaKey: 'staging',
    hasOverdue: true,
    label: 'Staging',
    title: 'Staging',
    description: 'Ingested rows held by the review gate before commit.',
    icon: Inbox,
    route: inbox('staging'),
    weight: 60,
    surfaces: ['cockpit'],
    minRole: 'editor',
  },
  {
    queueKey: 'content',
    countKey: 'review_cms',
    slaKey: 'cms',
    hasOverdue: true,
    label: 'CMS review',
    title: 'CMS review',
    description: 'Content edits submitted for review in the CMS.',
    icon: FileText,
    route: inbox('content'),
    weight: 50,
    surfaces: ['cockpit'],
    minRole: 'editor',
  },
  {
    queueKey: 'dedup-review',
    countKey: 'quality_duplicates',
    slaKey: 'quality_duplicates',
    hasOverdue: true,
    label: 'Duplicate merges',
    title: 'Duplicates',
    description:
      'Nightly identity sweep. Exact-key merges are automatic; ambiguous pairs wait here.',
    icon: GitMerge,
    route: inbox('dedup-review'),
    weight: 40,
    surfaces: ['cockpit', 'quality'],
    minRole: 'moderator',
  },
  {
    queueKey: 'org-link-review',
    countKey: 'review_org_links',
    slaKey: 'org_links',
    hasOverdue: true,
    label: 'Business links',
    title: 'Business links',
    description:
      'Ambiguous entity→business matches and brand mint proposals from the nightly spine backfill.',
    icon: Link2,
    // Reviewed inline on the hub rather than in the inbox: approving picks a
    // target org, an input the generic triage panel does not model.
    route: '/admin/quality',
    section: 'business-links',
    weight: 40,
    surfaces: ['cockpit', 'quality'],
    minRole: 'moderator',
  },
  {
    queueKey: 'quality-personality',
    countKey: 'quality_personality',
    slaKey: 'quality_personality',
    hasOverdue: true,
    label: 'Personality quality',
    title: 'Personalities',
    description: 'LLM-proposed identity fields and adult-cohort consent publishing.',
    icon: Users,
    route: inbox('quality-personality'),
    weight: 40,
    surfaces: ['cockpit', 'quality'],
    minRole: 'moderator',
  },
  {
    queueKey: 'quality-city',
    countKey: 'quality_city',
    slaKey: 'quality_city',
    hasOverdue: true,
    label: 'City quality',
    title: 'Cities',
    description: 'Safety notes, ratings, and hooks. Criminalizing destinations stay human-gated.',
    icon: MapPin,
    route: inbox('quality-city'),
    weight: 35,
    surfaces: ['cockpit', 'quality'],
    minRole: 'moderator',
  },
  {
    queueKey: 'quality-venue',
    countKey: 'quality_venue',
    slaKey: 'quality_venue',
    hasOverdue: true,
    label: 'Venue quality',
    title: 'Venues',
    description:
      'Amenity vocabulary and accessibility claims. Accessibility is always review-gated.',
    icon: Building,
    route: inbox('quality-venue'),
    weight: 35,
    surfaces: ['cockpit', 'quality'],
    minRole: 'moderator',
  },
  {
    queueKey: 'editorial',
    countKey: 'quality_editorial',
    slaKey: 'quality_editorial',
    hasOverdue: true,
    label: 'Editorial drafts',
    title: 'Editorial drafts',
    description: 'Country editorial hooks and paragraphs awaiting approval.',
    icon: PenLine,
    route: inbox('editorial'),
    weight: 30,
    surfaces: ['cockpit', 'quality'],
    minRole: 'moderator',
  },
  {
    queueKey: 'news-quality',
    countKey: 'review_news_quality',
    slaKey: 'news_quality',
    hasOverdue: true,
    label: 'News quality',
    title: 'News quality',
    description: 'Articles flagged by the news truth loop.',
    icon: Newspaper,
    route: inbox('news-quality'),
    weight: 30,
    surfaces: ['cockpit'],
    minRole: 'moderator',
  },
  {
    queueKey: 'quality-village',
    countKey: 'quality_village',
    slaKey: 'quality_village',
    hasOverdue: true,
    label: 'Village quality',
    title: 'Queer Villages',
    description: 'Grounded LLM rewrites of history, descriptions, and landmarks.',
    icon: Home,
    route: inbox('quality-village'),
    weight: 30,
    surfaces: ['cockpit', 'quality'],
    minRole: 'moderator',
  },
  {
    queueKey: 'tags',
    countKey: 'review_tags',
    slaKey: 'tags',
    hasOverdue: true,
    label: 'Tag suggestions',
    title: 'Tag suggestions',
    description: 'Proposed tag assignments awaiting a vocabulary decision.',
    icon: Tag,
    route: inbox('tags'),
    weight: 30,
    surfaces: ['cockpit'],
    minRole: 'editor',
  },
  {
    queueKey: 'quality-marketplace',
    countKey: 'quality_marketplace',
    slaKey: 'quality_marketplace',
    hasOverdue: true,
    label: 'Marketplace quality',
    title: 'Marketplace',
    description: 'Content-rating downgrades. Wrong-SFW never applies without approval.',
    icon: ShoppingBag,
    route: inbox('quality-marketplace'),
    weight: 25,
    surfaces: ['cockpit', 'quality'],
    minRole: 'moderator',
  },
  {
    queueKey: 'duplicates',
    countKey: 'review_duplicates',
    slaKey: 'duplicates',
    hasOverdue: true,
    label: 'Duplicate clusters',
    title: 'Duplicate clusters',
    description: 'Near-duplicate clusters surfaced by the triage duplicate view.',
    icon: CopyCheck,
    route: inbox('duplicates'),
    weight: 20,
    surfaces: ['cockpit'],
    minRole: 'moderator',
  },
  {
    queueKey: 'entity-links',
    countKey: 'review_entity_links',
    slaKey: 'entity_links',
    hasOverdue: true,
    label: 'Entity links',
    title: 'Entity links',
    description: 'Proposed cross-entity links awaiting confirmation.',
    icon: Link2,
    route: inbox('entity-links'),
    weight: 20,
    surfaces: ['cockpit'],
    minRole: 'moderator',
  },
  {
    queueKey: 'automation',
    countKey: 'review_automation',
    slaKey: 'automation',
    hasOverdue: true,
    label: 'Automation',
    title: 'Automation',
    description: 'Automation runs that stopped for a human decision.',
    icon: Bot,
    route: inbox('automation'),
    weight: 10,
    surfaces: ['cockpit'],
    minRole: 'moderator',
  },

  // ── Static gates: computed outside the triage_sources loop ────────────────
  {
    queueKey: null,
    countKey: 'review_feedback',
    slaKey: 'feedback',
    hasOverdue: true,
    label: 'Feedback',
    title: 'Feedback',
    description: 'New and under-review feedback from the in-app board.',
    icon: MessageSquare,
    route: '/admin/feedback',
    weight: 45,
    surfaces: ['cockpit'],
    minRole: 'editor',
  },
  {
    queueKey: null,
    countKey: 'review_group_requests',
    // No `_overdue` and no sla_hours entry: this is a membership decision, not
    // a content review, and the RPC computes it outside the registry loop.
    slaKey: null,
    hasOverdue: false,
    label: 'Group requests',
    title: 'Group requests',
    description: 'Pending requests to join a community group.',
    icon: UserPlus,
    route: '/admin/content/group-requests',
    weight: 55,
    surfaces: ['cockpit'],
    minRole: 'moderator',
  },
  {
    queueKey: null,
    countKey: 'quality_existence',
    slaKey: null,
    hasOverdue: false,
    label: 'Liveness & closure',
    title: 'Liveness & closure',
    description: 'Existence Engine: flagged dead entities awaiting archive review.',
    icon: Flag,
    route: '/admin/content/liveness',
    weight: 30,
    surfaces: ['cockpit', 'quality'],
    minRole: 'moderator',
  },
];

/** Quality hub cards, in hub display order. */
export const QUALITY_GATES: readonly AdminQueueDef[] = [
  'quality_city',
  'quality_venue',
  'quality_personality',
  'quality_marketplace',
  'quality_village',
  'quality_duplicates',
  'review_org_links',
  'quality_existence',
  'quality_editorial',
].map((key) => {
  const def = ADMIN_QUEUES.find((q) => q.countKey === key);
  if (!def) throw new Error(`QUALITY_GATES references unknown countKey: ${key}`);
  return def;
});

export function queueByCountKey(countKey: string): AdminQueueDef | undefined {
  return ADMIN_QUEUES.find((q) => q.countKey === countKey);
}

/** One queue resolved against a counts payload. */
export interface QueueRow {
  def: AdminQueueDef;
  count: number;
  /** Always 0 when `def.hasOverdue` is false — the RPC emits no companion. */
  overdue: number;
  slaHours?: number;
}

/**
 * Queues with pending work that `role` may see, most urgent first:
 * overdue before on-time, then registry weight, then size, then label. The last
 * two keys make the order total, so the list does not reshuffle between polls
 * when two queues tie.
 */
export function rankQueueRows(
  counts: AdminCounts | undefined,
  role: EffectiveRole,
  opts: { surface?: QueueSurface } = {},
): QueueRow[] {
  if (!counts) return [];
  const surface = opts.surface ?? 'cockpit';

  return ADMIN_QUEUES.filter(
    (def) => def.surfaces.includes(surface) && roleAtLeast(role, def.minRole),
  )
    .map((def) => {
      const count = counts[def.countKey];
      const overdue = def.hasOverdue ? (counts[`${def.countKey}_overdue`] ?? 0) : 0;
      return {
        def,
        count: typeof count === 'number' ? count : 0,
        overdue: typeof overdue === 'number' ? overdue : 0,
        slaHours: def.slaKey ? counts.sla_hours?.[def.slaKey] : undefined,
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => {
      const aLate = a.overdue > 0 ? 1 : 0;
      const bLate = b.overdue > 0 ? 1 : 0;
      if (aLate !== bLate) return bLate - aLate;
      if (a.def.weight !== b.def.weight) return b.def.weight - a.def.weight;
      if (a.count !== b.count) return b.count - a.count;
      return a.def.label.localeCompare(b.def.label);
    });
}

/** Headline aggregate for the cockpit status line. */
export function summarizeQueues(rows: QueueRow[]): {
  queues: number;
  items: number;
  overdueQueues: number;
  overdueItems: number;
} {
  return rows.reduce(
    (acc, row) => ({
      queues: acc.queues + 1,
      items: acc.items + row.count,
      overdueQueues: acc.overdueQueues + (row.overdue > 0 ? 1 : 0),
      overdueItems: acc.overdueItems + row.overdue,
    }),
    { queues: 0, items: 0, overdueQueues: 0, overdueItems: 0 },
  );
}
