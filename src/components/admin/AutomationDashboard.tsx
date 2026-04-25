/**
 * AutomationDashboard — Admin dashboard for the background automation system.
 *
 * Tabs: Overview · Modules · Review Queue · Link Health · Geo Validation
 *
 * Live-updating via Supabase Realtime on content_flags table.
 */

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import Switch from '@mui/material/Switch';
import Slider from '@mui/material/Slider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import {
  Zap,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Link2,
  MapPin,
  Tag,
  Shield,
  Bot,
  Phone,
  Calendar,
  Play,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Activity,
  BarChart3,
  Globe,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAutomationMonitor,
  type AutomationModule,
  type ContentFlag,
} from '@/hooks/useAutomationMonitor';
import { formatDistanceToNow } from 'date-fns';

// ── Category Icons ──────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  content_quality: Shield,
  link_validation: Link2,
  geo_enrichment: MapPin,
  date_normalization: Calendar,
  tagging: Tag,
  contact_normalization: Phone,
  ai_enhancement: Bot,
};

const SEVERITY_COLORS: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
  critical: 'error',
};

const FLAG_TYPE_LABELS: Record<string, string> = {
  quality_issue: 'Quality Issue',
  broken_link: 'Broken Link',
  geo_mismatch: 'Geo Mismatch',
  date_issue: 'Date Issue',
  missing_tags: 'Missing Tags',
  contact_invalid: 'Invalid Contact',
  ai_suggestion: 'AI Suggestion',
  duplicate: 'Duplicate',
  encoding_issue: 'Encoding Issue',
  outdated: 'Outdated',
};

// ── Main Component ──────────────────────────────────────────────────────────

export function AutomationDashboard() {
  const {
    modules,
    pendingFlags,
    deadLinks,
    geoMismatches,
    stats,
    flagStats,
    isLoading,
    linksLoading,
    geoLoading,
    toggleModule,
    reviewFlag,
    triggerModule,
    updateModuleConfig,
    isToggling,
    isReviewing,
    isTriggering,
  } = useAutomationMonitor();

  const [selectedFlag, setSelectedFlag] = useState<ContentFlag | null>(null);
  const [configModule, setConfigModule] = useState<AutomationModule | null>(null);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress  aria-label="Loading"/>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Stats Overview */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)', lg: 'repeat(7, 1fr)' },
          gap: 2,
        }}
      >
        <StatCard
          icon={Zap}
          label="Active Modules"
          value={stats.enabledModules}
          total={stats.totalModules}
        />
        <StatCard
          icon={AlertTriangle}
          label="Pending Review"
          value={stats.pendingFlags}
          color={stats.pendingFlags > 0 ? '#f59e0b' : undefined}
        />
        <StatCard icon={CheckCircle2} label="Applied" value={stats.appliedFlags} color="#22c55e" />
        <StatCard
          icon={Link2}
          label="Dead Links"
          value={stats.deadLinks}
          color={stats.deadLinks > 0 ? '#ef4444' : undefined}
        />
        <StatCard
          icon={MapPin}
          label="Geo Mismatches"
          value={stats.geoMismatches}
          color={stats.geoMismatches > 0 ? '#f59e0b' : undefined}
        />
        <StatCard icon={BarChart3} label="Total Processed" value={stats.totalProcessed} />
        <StatCard icon={Activity} label="Modules" value={modules.length} />
      </Box>

      {/* Tabs */}
      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="review">
            Review Queue
            {stats.pendingFlags > 0 && (
              <Badge
                variant="destructive"
                style={{ marginLeft: 6, fontSize: '0.65rem', padding: '0 4px' }}
              >
                {stats.pendingFlags}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="links">Link Health</TabsTrigger>
          <TabsTrigger value="geo">Geo Validation</TabsTrigger>
        </TabsList>

        {/* ── Modules Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="modules">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {modules.map((mod) => {
              const CategoryIcon = CATEGORY_ICONS[mod.category] || Zap;
              return (
                <Card key={mod.id}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {/* Icon + Info */}
                      <Box
                        sx={{
                          p: 1,
                          bgcolor: mod.is_enabled ? '#dcfce7' : '#f3f4f6',
                          borderRadius: 2,
                          display: 'flex',
                        }}
                      >
                        <CategoryIcon
                          size={20}
                          style={{ color: mod.is_enabled ? '#16a34a' : '#9ca3af' }}
                        />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                            {mod.display_name}
                          </Typography>
                          {mod.schedule && (
                            <Chip
                              size="small"
                              label={mod.schedule}
                              variant="outlined"
                              sx={{ fontSize: '0.7rem', height: 20 }}
                            />
                          )}
                          {mod.auto_approve && (
                            <Chip
                              size="small"
                              label="Auto-approve"
                              color="success"
                              sx={{ fontSize: '0.7rem', height: 20 }}
                            />
                          )}
                        </Box>
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mt: 0.25 }}>
                          {mod.description}
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            gap: 2,
                            mt: 0.5,
                            fontSize: '0.75rem',
                            color: 'text.secondary',
                          }}
                        >
                          <span>Confidence: {(mod.confidence_threshold * 100).toFixed(0)}%</span>
                          <span>Batch: {mod.batch_size}</span>
                          <span>Runs: {mod.total_runs}</span>
                          <span>Processed: {mod.total_items_processed.toLocaleString()}</span>
                          {mod.last_run_at && (
                            <span>
                              Last run:{' '}
                              {formatDistanceToNow(new Date(mod.last_run_at), { addSuffix: true })}
                            </span>
                          )}
                          {mod.last_run_status && (
                            <Chip
                              size="small"
                              label={mod.last_run_status}
                              color={
                                mod.last_run_status === 'success'
                                  ? 'success'
                                  : mod.last_run_status === 'partial'
                                    ? 'warning'
                                    : 'error'
                              }
                              sx={{ fontSize: '0.65rem', height: 18 }}
                            />
                          )}
                        </Box>
                      </Box>

                      {/* Actions */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Tooltip title="Configure module">
                          <IconButton size="small" onClick={() => setConfigModule(mod)}>
                            <Settings size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Trigger now">
                          <span>
                            <IconButton
                              size="small"
                              disabled={!mod.is_enabled || isTriggering}
                              onClick={() => triggerModule(mod.name)}
                            >
                              <Play size={16} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={mod.is_enabled ? 'Disable' : 'Enable'}>
                          <Switch
                            size="small"
                            checked={mod.is_enabled}
                            disabled={isToggling}
                            onChange={() =>
                              toggleModule({ moduleId: mod.id, enabled: !mod.is_enabled })
                            }
                          />
                        </Tooltip>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        </TabsContent>

        {/* ── Review Queue Tab ─────────────────────────────────────────────── */}
        <TabsContent value="review">
          <Card>
            <CardHeader>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <CardTitle>Review Queue</CardTitle>
                  <CardDescription>
                    {stats.pendingFlags} pending &middot; {stats.appliedFlags} applied &middot;{' '}
                    {flagStats?.rejected || 0} rejected
                  </CardDescription>
                </Box>
              </Box>
            </CardHeader>
            <CardContent>
              {pendingFlags.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                  <CheckCircle2 size={40} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                  <Typography>No pending items. All caught up!</Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Type</TableCell>
                        <TableCell>Title</TableCell>
                        <TableCell>Content</TableCell>
                        <TableCell>Severity</TableCell>
                        <TableCell>Confidence</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pendingFlags.map((flag) => (
                        <TableRow key={flag.id} hover>
                          <TableCell>
                            <Chip
                              size="small"
                              label={FLAG_TYPE_LABELS[flag.flag_type] || flag.flag_type}
                              sx={{ fontSize: '0.7rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography
                              sx={{
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                '&:hover': { textDecoration: 'underline' },
                              }}
                              onClick={() => setSelectedFlag(flag)}
                            >
                              {flag.title}
                            </Typography>
                            {flag.description && (
                              <Typography
                                sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}
                              >
                                {flag.description.slice(0, 80)}
                                {flag.description.length > 80 ? '...' : ''}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={flag.content_type}
                              variant="outlined"
                              sx={{ fontSize: '0.65rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={flag.severity}
                              color={SEVERITY_COLORS[flag.severity] || 'default'}
                              sx={{ fontSize: '0.65rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            {flag.confidence != null
                              ? `${(flag.confidence * 100).toFixed(0)}%`
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                              {formatDistanceToNow(new Date(flag.created_at), { addSuffix: true })}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                              <Tooltip title="View details">
                                <IconButton size="small" onClick={() => setSelectedFlag(flag)}>
                                  <Eye size={14} />
                                </IconButton>
                              </Tooltip>
                              {flag.suggested_value && (
                                <Tooltip title="Approve & Apply">
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="success"
                                      disabled={isReviewing}
                                      onClick={() =>
                                        reviewFlag({ flagId: flag.id, action: 'approved' })
                                      }
                                    >
                                      <ThumbsUp size={14} />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              )}
                              <Tooltip title="Reject">
                                <span>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    disabled={isReviewing}
                                    onClick={() =>
                                      reviewFlag({ flagId: flag.id, action: 'rejected' })
                                    }
                                  >
                                    <ThumbsDown size={14} />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Link Health Tab ──────────────────────────────────────────────── */}
        <TabsContent value="links">
          <Card>
            <CardHeader>
              <CardTitle>Dead & Broken Links</CardTitle>
              <CardDescription>{deadLinks.length} broken links found</CardDescription>
            </CardHeader>
            <CardContent>
              {linksLoading ? (
                <LinearProgress />
              ) : deadLinks.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                  <Link2 size={40} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                  <Typography>All links are healthy!</Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Content</TableCell>
                        <TableCell>Field</TableCell>
                        <TableCell>URL</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Response</TableCell>
                        <TableCell>Error</TableCell>
                        <TableCell>Checked</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {deadLinks.map((link) => (
                        <TableRow key={link.id} hover>
                          <TableCell>
                            <Chip
                              size="small"
                              label={link.content_type}
                              variant="outlined"
                              sx={{ fontSize: '0.65rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: '0.8rem' }}>{link.field_name}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              sx={{
                                fontSize: '0.75rem',
                                fontFamily: 'monospace',
                                maxWidth: 300,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={link.original_url}
                            >
                              {link.original_url}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={link.http_status || 'Timeout'}
                              color={link.http_status ? 'warning' : 'error'}
                              sx={{ fontSize: '0.65rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                              {link.response_time_ms ? `${link.response_time_ms}ms` : '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              sx={{
                                fontSize: '0.75rem',
                                color: 'error.main',
                                maxWidth: 200,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {link.error_message || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                              {formatDistanceToNow(new Date(link.last_checked_at), {
                                addSuffix: true,
                              })}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Geo Validation Tab ───────────────────────────────────────────── */}
        <TabsContent value="geo">
          <Card>
            <CardHeader>
              <CardTitle>Geographic Mismatches</CardTitle>
              <CardDescription>{geoMismatches.length} mismatches detected</CardDescription>
            </CardHeader>
            <CardContent>
              {geoLoading ? (
                <LinearProgress />
              ) : geoMismatches.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                  <Globe size={40} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                  <Typography>No geographic mismatches found!</Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Content</TableCell>
                        <TableCell>Geocoded Location</TableCell>
                        <TableCell>Country</TableCell>
                        <TableCell>Mismatch</TableCell>
                        <TableCell>Confidence</TableCell>
                        <TableCell>Validated</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {geoMismatches.map((geo) => (
                        <TableRow key={geo.id} hover>
                          <TableCell>
                            <Chip
                              size="small"
                              label={geo.content_type}
                              variant="outlined"
                              sx={{ fontSize: '0.65rem' }}
                            />
                            <Typography
                              sx={{
                                fontSize: '0.7rem',
                                color: 'text.secondary',
                                fontFamily: 'monospace',
                              }}
                            >
                              {geo.content_id.slice(0, 8)}...
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: '0.8rem' }}>
                              {[geo.city, geo.region].filter(Boolean).join(', ')}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: '0.8rem' }}>
                              {geo.country} {geo.country_code ? `(${geo.country_code})` : ''}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              sx={{ fontSize: '0.75rem', color: 'warning.main', maxWidth: 250 }}
                            >
                              {geo.mismatch_details}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {geo.confidence != null ? `${(geo.confidence * 100).toFixed(0)}%` : '—'}
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                              {formatDistanceToNow(new Date(geo.last_validated_at), {
                                addSuffix: true,
                              })}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Flag Detail Dialog ──────────────────────────────────────────────── */}
      <FlagDetailDialog
        flag={selectedFlag}
        onClose={() => setSelectedFlag(null)}
        onApprove={(id) => {
          reviewFlag({ flagId: id, action: 'approved' });
          setSelectedFlag(null);
        }}
        onReject={(id) => {
          reviewFlag({ flagId: id, action: 'rejected' });
          setSelectedFlag(null);
        }}
        isReviewing={isReviewing}
      />

      {/* ── Module Config Dialog ───────────────────────────────────────────── */}
      <ModuleConfigDialog
        module={configModule}
        onClose={() => setConfigModule(null)}
        onSave={(id, updates) => {
          updateModuleConfig({ moduleId: id, updates });
          setConfigModule(null);
        }}
      />
    </Box>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  total,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  total?: number;
  color?: string;
}) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{label}</Typography>
          <Icon size={14} style={{ color: color || 'var(--muted-foreground)' }} />
        </Box>
        <Typography sx={{ fontSize: '1.3rem', fontWeight: 'bold', color: color || 'inherit' }}>
          {value.toLocaleString()}
          {total != null && (
            <Typography
              component="span"
              sx={{ fontSize: '0.75rem', color: 'text.secondary', ml: 0.5 }}
            >
              / {total}
            </Typography>
          )}
        </Typography>
      </CardContent>
    </Card>
  );
}

// ── Flag Detail Dialog ──────────────────────────────────────────────────────

function FlagDetailDialog({
  flag,
  onClose,
  onApprove,
  onReject,
  isReviewing,
}: {
  flag: ContentFlag | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isReviewing: boolean;
}) {
  if (!flag) return null;

  return (
    <Dialog open={!!flag} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertTriangle size={20} />
          {flag.title}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip size="small" label={FLAG_TYPE_LABELS[flag.flag_type] || flag.flag_type} />
            <Chip
              size="small"
              label={flag.severity}
              color={SEVERITY_COLORS[flag.severity] || 'default'}
            />
            <Chip size="small" label={flag.content_type} variant="outlined" />
            <Chip size="small" label={`Module: ${flag.module_name}`} variant="outlined" />
            {flag.confidence != null && (
              <Chip
                size="small"
                label={`Confidence: ${(flag.confidence * 100).toFixed(0)}%`}
                variant="outlined"
              />
            )}
          </Box>

          {flag.description && (
            <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>
              {flag.description}
            </Typography>
          )}

          {flag.current_value && (
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 0.5 }}>
                Current Value
              </Typography>
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: '#fef2f2',
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {JSON.stringify(flag.current_value, null, 2)}
              </Box>
            </Box>
          )}

          {flag.suggested_value && (
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 0.5 }}>
                Suggested Value
              </Typography>
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: '#f0fdf4',
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {JSON.stringify(flag.suggested_value, null, 2)}
              </Box>
            </Box>
          )}

          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            Content ID: {flag.content_id} &middot; Created{' '}
            {formatDistanceToNow(new Date(flag.created_at), { addSuffix: true })}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="outline"
          style={{ borderColor: '#ef4444', color: '#ef4444' }}
          disabled={isReviewing}
          onClick={() => onReject(flag.id)}
        >
          <ThumbsDown size={14} style={{ marginRight: 4 }} />
          Reject
        </Button>
        {flag.suggested_value && (
          <Button disabled={isReviewing} onClick={() => onApprove(flag.id)}>
            <ThumbsUp size={14} style={{ marginRight: 4 }} />
            Approve & Apply
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ── Module Config Dialog ────────────────────────────────────────────────────

function ModuleConfigDialog({
  module: mod,
  onClose,
  onSave,
}: {
  module: AutomationModule | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<AutomationModule>) => void;
}) {
  const [threshold, setThreshold] = useState(0);
  const [batchSize, setBatchSize] = useState(0);
  const [autoApprove, setAutoApprove] = useState(false);

  React.useEffect(() => {
    if (mod) {
      setThreshold(mod.confidence_threshold * 100);
      setBatchSize(mod.batch_size);
      setAutoApprove(mod.auto_approve);
    }
  }, [mod]);

  if (!mod) return null;

  return (
    <Dialog open={!!mod} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Settings size={20} />
          Configure: {mod.display_name}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
          <Box>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, mb: 1 }}>
              Confidence Threshold: {threshold.toFixed(0)}%
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
              Changes above this confidence level can be auto-approved
            </Typography>
            <Slider
              value={threshold}
              onChange={(_, v) => setThreshold(v as number)}
              min={50}
              max={100}
              step={5}
              marks={[
                { value: 50, label: '50%' },
                { value: 75, label: '75%' },
                { value: 100, label: '100%' },
              ]}
            />
          </Box>

          <Box>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, mb: 1 }}>
              Batch Size: {batchSize}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 1 }}>
              Number of items to process per run
            </Typography>
            <Slider
              value={batchSize}
              onChange={(_, v) => setBatchSize(v as number)}
              min={10}
              max={500}
              step={10}
            />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 500 }}>Auto-Approve</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                Automatically apply changes above confidence threshold
              </Typography>
            </Box>
            <Switch checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() =>
            onSave(mod.id, {
              confidence_threshold: threshold / 100,
              batch_size: batchSize,
              auto_approve: autoApprove,
            })
          }
        >
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AutomationDashboard;
