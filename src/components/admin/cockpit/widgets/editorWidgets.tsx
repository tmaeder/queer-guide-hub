/**
 * Editor-tier cockpit widgets: triage inbox, content overview, submissions,
 * tag suggestions, quality index. Live counts + drill-down into pre-filtered
 * admin pages.
 */

import { useNavigate } from 'react-router';
import {
  Inbox,
  UsersRound,
  Flag,
  Bot,
  FileCheck,
  Tag,
  Building,
  Calendar,
  Users,
  Newspaper,
  MapPin,
  Globe,
  Hotel,
  Home,
  ShoppingBag,
  FileText,
} from 'lucide-react';
import {
  useReviewSummaryQuery,
  useContentStatsQuery,
  useQualityIndexQuery,
} from '@/hooks/useAdminCockpit';
import { adminLink } from '@/config/adminLinks';
import { FreshnessIndicator } from '../FreshnessIndicator';
import { BigStat, StatRow, DrillButton, WidgetLoading } from './shared';
import type { WidgetRenderContext } from '../types';

const REVIEW_QUEUES = [
  { key: 'staging', label: 'Staging', icon: Inbox, tab: 'staging' },
  { key: 'submissions', label: 'Submissions', icon: UsersRound, tab: 'submissions' },
  { key: 'moderation', label: 'Moderation', icon: Flag, tab: 'moderation' },
  { key: 'automation', label: 'Automation', icon: Bot, tab: 'automation' },
  { key: 'cmsReview', label: 'Content', icon: FileCheck, tab: 'content' },
  { key: 'tagSuggestions', label: 'Tags', icon: Tag, tab: 'tags' },
] as const;

export function TriageInboxBody({ openDrillDown }: WidgetRenderContext) {
  const navigate = useNavigate();
  const q = useReviewSummaryQuery();
  const r = q.data;

  if (!r) return <WidgetLoading />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <BigStat value={r.total.toLocaleString()} caption="items awaiting review" alert={r.total > 50} />
        <FreshnessIndicator dataUpdatedAt={q.dataUpdatedAt} isFetching={q.isFetching} intervalMs={30_000} />
      </div>
      <div className="flex flex-col">
        {REVIEW_QUEUES.slice(0, 3).map((qd) => (
          <StatRow
            key={qd.key}
            label={qd.label}
            icon={qd.icon}
            value={(r[qd.key] ?? 0).toLocaleString()}
            onClick={() => navigate(adminLink.review(qd.tab))}
          />
        ))}
      </div>
      <DrillButton
        label="All queues"
        onClick={() =>
          openDrillDown({
            title: 'Review queues',
            description: `${r.total.toLocaleString()} items across all queues`,
            render: () => (
              <div className="flex flex-col divide-y divide-border">
                {REVIEW_QUEUES.map((qd) => (
                  <StatRow
                    key={qd.key}
                    label={qd.label}
                    icon={qd.icon}
                    value={(r[qd.key] ?? 0).toLocaleString()}
                    onClick={() => navigate(adminLink.review(qd.tab))}
                  />
                ))}
              </div>
            ),
          })
        }
      />
    </div>
  );
}

const CONTENT_TILES = [
  { key: 'venues', label: 'Venues', icon: Building, type: 'venues' },
  { key: 'events', label: 'Events', icon: Calendar, type: 'events' },
  { key: 'personalities', label: 'People', icon: Users, type: 'personalities' },
  { key: 'news', label: 'News', icon: Newspaper, type: 'news_articles' },
  { key: 'cities', label: 'Cities', icon: MapPin, type: 'cities' },
  { key: 'countries', label: 'Countries', icon: Globe, type: 'countries' },
  { key: 'hotels', label: 'Hotels', icon: Hotel, type: 'hotels' },
  { key: 'villages', label: 'Villages', icon: Home, type: 'queer_villages' },
  { key: 'marketplace', label: 'Market', icon: ShoppingBag, type: 'marketplace_listings' },
  { key: 'groups', label: 'Groups', icon: UsersRound, type: 'community_groups' },
  { key: 'tags', label: 'Tags', icon: Tag, type: 'unified_tags' },
  { key: 'pages', label: 'Pages', icon: FileText, type: 'cms_pages' },
] as const;

export function ContentOverviewBody() {
  const navigate = useNavigate();
  const q = useContentStatsQuery();
  const stats = q.data;
  if (!stats) return <WidgetLoading rows={2} />;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-px bg-border">
      {CONTENT_TILES.map(({ key, label, icon: Icon, type }) => (
        <button
          key={key}
          type="button"
          onClick={() => navigate(adminLink.content(type))}
          className="flex flex-col items-center gap-1 p-4 bg-background hover:bg-muted/30 text-center"
        >
          <Icon size={16} className="text-muted-foreground" aria-hidden />
          <div className="text-base font-bold leading-none">
            {(stats[key as keyof typeof stats] ?? 0).toLocaleString()}
          </div>
          <div className="font-medium text-muted-foreground text-2xs">{label}</div>
        </button>
      ))}
    </div>
  );
}

export function SubmissionsBody() {
  const navigate = useNavigate();
  const q = useReviewSummaryQuery();
  if (!q.data) return <WidgetLoading rows={1} />;
  return (
    <div className="flex flex-col gap-3">
      <BigStat value={q.data.submissions.toLocaleString()} caption="community submissions" />
      <DrillButton label="Review submissions" onClick={() => navigate(adminLink.review('submissions'))} />
    </div>
  );
}

export function TagSuggestionsBody() {
  const navigate = useNavigate();
  const q = useReviewSummaryQuery();
  if (!q.data) return <WidgetLoading rows={1} />;
  return (
    <div className="flex flex-col gap-3">
      <BigStat value={q.data.tagSuggestions.toLocaleString()} caption="pending tag suggestions" />
      <DrillButton label="Review tags" onClick={() => navigate(adminLink.review('tags'))} />
    </div>
  );
}

export function QualityIndexBody({ openDrillDown }: WidgetRenderContext) {
  const q = useQualityIndexQuery();
  const quality = q.data;
  if (!quality) return <WidgetLoading rows={2} />;

  const byType = Object.entries(quality.byContentType ?? {});

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <BigStat value={`${quality.overallScore}%`} caption="overall quality" alert={quality.overallScore < 60} />
        <FreshnessIndicator dataUpdatedAt={q.dataUpdatedAt} isFetching={q.isFetching} intervalMs={300_000} />
      </div>
      <div className="bg-muted" style={{ height: 4 }}>
        <div className="h-full bg-foreground" style={{ width: `${quality.overallScore}%` }} />
      </div>
      <div className="flex gap-4 text-2xs font-medium text-muted-foreground">
        <span>{quality.warnings} warnings</span>
        <span className={quality.critical > 0 ? 'text-destructive' : undefined}>
          {quality.critical} critical
        </span>
      </div>
      {byType.length > 0 && (
        <DrillButton
          label="By content type"
          onClick={() =>
            openDrillDown({
              title: 'Quality by content type',
              render: () => (
                <div className="flex flex-col divide-y divide-border">
                  {byType.map(([type, v]) => (
                    <StatRow
                      key={type}
                      label={type}
                      value={`${v.score}% · ${v.withIssues}/${v.total} flagged`}
                      alert={v.score < 60}
                    />
                  ))}
                </div>
              ),
            })
          }
        />
      )}
    </div>
  );
}
