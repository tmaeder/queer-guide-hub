/**
 * AdminDashboard — Unified Cockpit Dashboard.
 * Four-quadrant layout: System Status, Review Queue, Import Status, Quality Index.
 * Plus content stats grid and quick actions.
 */

import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';
import {
  LayoutDashboard,
  Activity,
  ClipboardCheck,
  Download,
  ShieldCheck,
  Building,
  Calendar,
  Users,
  Newspaper,
  MapPin,
  Globe,
  Hotel,
  Home,
  ShoppingBag,
  UsersRound,
  Tag,
  FileText,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Plus,
  ArrowRight,
  Inbox,
  Flag,
  Bot,
  FileCheck,
  Zap,
} from 'lucide-react';
import { useAdminCockpit } from '@/hooks/useAdminCockpit';
import type { CockpitData } from '@/hooks/useAdminCockpit';

// ── Quadrant Card ──────────────────────────────────────────────────

function QuadrantCard({
  title,
  icon: Icon,
  color,
  children,
  action,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  children: React.ReactNode;
  action?: { label: string; route: string };
}) {
  const navigate = useNavigate();
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: 2,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(color, 0.1),
            }}
          >
            <Icon size={15} style={{ color }} />
          </Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        </Box>
        {action && (
          <Button
            size="small"
            endIcon={<ArrowRight size={14} />}
            onClick={() => navigate(action.route)}
            sx={{ textTransform: 'none', fontSize: '0.75rem', fontWeight: 500 }}
          >
            {action.label}
          </Button>
        )}
      </Box>
      {children}
    </Paper>
  );
}

// ── System Status ───────────────────────────────────────────────────

function SystemStatus({ data }: { data: CockpitData }) {
  const { system } = data;
  const statusColors = { healthy: '#10b981', degraded: '#f59e0b', error: '#ef4444' };
  const statusLabels = { healthy: 'All Systems Operational', degraded: 'Degraded Performance', error: 'System Issues' };
  const StatusIcon = system.status === 'healthy' ? CheckCircle2 : system.status === 'degraded' ? AlertTriangle : AlertCircle;

  return (
    <QuadrantCard title="System Status" icon={Activity} color="#10b981">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <StatusIcon size={20} style={{ color: statusColors[system.status] }} />
        <Typography variant="body2" sx={{ fontWeight: 600, color: statusColors[system.status] }}>
          {statusLabels[system.status]}
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        <MetricBox label="DB Latency" value={`${system.dbLatencyMs}ms`} good={system.dbLatencyMs < 200} />
        <MetricBox label="Errors" value={system.recentErrors.toString()} good={system.recentErrors === 0} />
      </Box>
    </QuadrantCard>
  );
}

function MetricBox({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 1.5,
        bgcolor: good ? alpha('#10b981', 0.06) : alpha('#f59e0b', 0.06),
        textAlign: 'center',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 700, color: good ? '#10b981' : '#f59e0b' }}>
        {value}
      </Typography>
    </Box>
  );
}

// ── Review Queue ────────────────────────────────────────────────────

function ReviewQueueWidget({ data }: { data: CockpitData }) {
  const navigate = useNavigate();
  const { review } = data;
  const queues = [
    { label: 'Staging', count: review.staging, color: '#ea580c', icon: Inbox, tab: 'staging' },
    { label: 'Moderation', count: review.moderation, color: '#f59e0b', icon: Flag, tab: 'moderation' },
    { label: 'Automation', count: review.automation, color: '#8b5cf6', icon: Bot, tab: 'automation' },
    { label: 'Content', count: review.cmsReview, color: '#3b82f6', icon: FileCheck, tab: 'content' },
    { label: 'Tags', count: review.tagSuggestions, color: '#a855f7', icon: Tag, tab: 'tags' },
  ];

  return (
    <QuadrantCard title="Review Queue" icon={ClipboardCheck} color="#f59e0b" action={{ label: 'All Reviews', route: '/admin/review' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {queues.map((q) => (
          <Box
            key={q.label}
            onClick={() => navigate(`/admin/review?tab=${q.tab}`)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 1.5,
              py: 0.75,
              borderRadius: 1,
              cursor: 'pointer',
              transition: 'background 0.15s',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <q.icon size={14} style={{ color: q.color }} />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{q.label}</Typography>
            </Box>
            <Chip
              label={q.count > 0 ? q.count.toLocaleString() : '0'}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.7rem',
                fontWeight: 700,
                bgcolor: q.count > 0 ? alpha(q.color, 0.12) : 'action.selected',
                color: q.count > 0 ? q.color : 'text.secondary',
              }}
            />
          </Box>
        ))}
      </Box>
      {review.total > 0 && (
        <Typography variant="caption" sx={{ fontWeight: 600, color: '#f59e0b', mt: 0.5 }}>
          {review.total.toLocaleString()} total items need attention
        </Typography>
      )}
    </QuadrantCard>
  );
}

// ── Import Status ───────────────────────────────────────────────────

function ImportStatus({ data }: { data: CockpitData }) {
  const { imports } = data;

  return (
    <QuadrantCard title="Import Status" icon={Download} color="#10b981" action={{ label: 'Imports', route: '/admin/imports' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        <MetricBox label="Active Jobs" value={imports.activeJobs.toString()} good={imports.activeJobs < 5} />
        <MetricBox label="Completed Today" value={imports.completedToday.toString()} good={true} />
        <MetricBox label="Failed Today" value={imports.failedToday.toString()} good={imports.failedToday === 0} />
        <MetricBox label="Error Rate" value={`${imports.errorRate}%`} good={imports.errorRate < 10} />
      </Box>
    </QuadrantCard>
  );
}

// ── Quality Index ───────────────────────────────────────────────────

function QualityWidget({ data }: { data: CockpitData }) {
  const { quality } = data;
  const scoreColor = quality.overallScore >= 90 ? '#10b981' : quality.overallScore >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <QuadrantCard title="Quality Index" icon={ShieldCheck} color="#3b82f6" action={{ label: 'Details', route: '/admin/review?tab=automation' }}>
      <Box sx={{ textAlign: 'center', py: 1 }}>
        <Typography variant="h3" sx={{ fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
          {quality.overallScore}%
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
          Overall Quality Score
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={quality.overallScore}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: alpha(scoreColor, 0.12),
          '& .MuiLinearProgress-bar': { bgcolor: scoreColor, borderRadius: 3 },
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AlertTriangle size={12} style={{ color: '#f59e0b' }} />
          <Typography variant="caption" sx={{ fontWeight: 500 }}>{quality.warnings} warnings</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AlertCircle size={12} style={{ color: '#ef4444' }} />
          <Typography variant="caption" sx={{ fontWeight: 500 }}>{quality.critical} critical</Typography>
        </Box>
      </Box>
    </QuadrantCard>
  );
}

// ── Content Stats Grid ──────────────────────────────────────────────

const contentStatItems = [
  { key: 'venues', label: 'Venues', icon: Building, color: '#8b5cf6', route: '/admin/content/venues' },
  { key: 'events', label: 'Events', icon: Calendar, color: '#ec4899', route: '/admin/content/events' },
  { key: 'personalities', label: 'Personalities', icon: Users, color: '#f59e0b', route: '/admin/content/personalities' },
  { key: 'news', label: 'News', icon: Newspaper, color: '#3b82f6', route: '/admin/content/news_articles' },
  { key: 'cities', label: 'Cities', icon: MapPin, color: '#10b981', route: '/admin/content/cities' },
  { key: 'countries', label: 'Countries', icon: Globe, color: '#6366f1', route: '/admin/content/countries' },
  { key: 'hotels', label: 'Hotels', icon: Hotel, color: '#0ea5e9', route: '/admin/content/hotels' },
  { key: 'villages', label: 'Villages', icon: Home, color: '#d946ef', route: '/admin/content/queer_villages' },
  { key: 'marketplace', label: 'Marketplace', icon: ShoppingBag, color: '#f97316', route: '/admin/content/marketplace_listings' },
  { key: 'groups', label: 'Groups', icon: UsersRound, color: '#a855f7', route: '/admin/content/community_groups' },
  { key: 'tags', label: 'Tags', icon: Tag, color: '#14b8a6', route: '/admin/content/unified_tags' },
  { key: 'pages', label: 'Pages', icon: FileText, color: '#64748b', route: '/admin/content/cms_pages' },
] as const;

function ContentStatsGrid({ stats }: { stats: CockpitData['stats'] }) {
  const navigate = useNavigate();

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Content Overview</Typography>
        <Typography variant="caption" color="text.secondary">
          {Object.values(stats).reduce((a, b) => a + b, 0).toLocaleString()} total items
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', md: 'repeat(6, 1fr)' }, gap: 1.5 }}>
        {contentStatItems.map(({ key, label, icon: Icon, color, route }) => (
          <Box
            key={key}
            onClick={() => navigate(route)}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.5,
              p: 1.5,
              borderRadius: 1.5,
              cursor: 'pointer',
              transition: 'all 0.15s',
              '&:hover': { bgcolor: alpha(color, 0.06), transform: 'translateY(-1px)' },
            }}
          >
            <Icon size={18} style={{ color }} />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', lineHeight: 1 }}>
              {(stats[key as keyof typeof stats] ?? 0).toLocaleString()}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, fontSize: '0.65rem' }}>
              {label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

// ── Quick Actions ───────────────────────────────────────────────────

function QuickActionsBar() {
  const navigate = useNavigate();
  const actions = [
    { label: 'New Content', icon: Plus, route: '/admin/content', color: '#8b5cf6' },
    { label: 'Import Data', icon: Download, route: '/admin/imports/create', color: '#10b981' },
    { label: 'Review Queue', icon: ClipboardCheck, route: '/admin/review', color: '#f59e0b' },
    { label: 'Automation', icon: Zap, route: '/admin/automation', color: '#f59e0b' },
  ];

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      {actions.map((a) => (
        <Button
          key={a.label}
          variant="outlined"
          size="small"
          startIcon={<a.icon size={15} />}
          onClick={() => navigate(a.route)}
          sx={{
            textTransform: 'none',
            fontWeight: 500,
            borderColor: alpha(a.color, 0.3),
            color: a.color,
            display: { xs: 'none', sm: 'inline-flex' },
            '&:hover': { borderColor: a.color, bgcolor: alpha(a.color, 0.04) },
          }}
        >
          {a.label}
        </Button>
      ))}
    </Box>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────

function CockpitSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={220} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
      <Skeleton variant="rounded" height={160} sx={{ borderRadius: 2 }} />
    </Box>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function AdminDashboard() {
  const { data, isLoading, refetch } = useAdminCockpit();

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <LayoutDashboard size={24} style={{ color: '#8b5cf6' }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Cockpit</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <QuickActionsBar />
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => refetch()}>
              <RefreshCw size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {isLoading || !data ? (
        <CockpitSkeleton />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Four quadrants */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <SystemStatus data={data} />
            <ReviewQueueWidget data={data} />
            <ImportStatus data={data} />
            <QualityWidget data={data} />
          </Box>

          {/* Content stats */}
          <ContentStatsGrid stats={data.stats} />
        </Box>
      )}
    </Box>
  );
}
