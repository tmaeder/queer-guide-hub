/**
 * AutoModerationQueue — Automated content moderation interface.
 *
 * Shows content_flags from the automation system with:
 *   - Auto-resolve: one-click approve all high-confidence suggestions
 *   - Manual review for lower-confidence flags
 *   - Severity-based filtering and sorting
 *   - Diff view comparing current vs suggested values
 */

import { useState, useMemo } from 'react';
import { Link as RouterLink } from 'react-router';
import { useAutomationMonitor, type ContentFlag } from '@/hooks/useAutomationMonitor';
import {
  Bot,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Zap,
  Filter,
  AlertTriangle,
  Info,
  AlertOctagon,
  ShieldCheck,
  Settings,
  Scale,
  Heart,
  EyeOff,
  Flag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import MuiLink from '@mui/material/Link';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import LinearProgress from '@mui/material/LinearProgress';
import Slider from '@mui/material/Slider';

const SEVERITY_COLORS: Record<string, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
  critical: '#dc2626',
};

const SEVERITY_ICONS: Record<string, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertOctagon,
  critical: AlertOctagon,
};

const FLAG_TYPE_LABELS: Record<string, string> = {
  quality_issue: 'Quality Issue',
  broken_link: 'Broken Link',
  geo_mismatch: 'Geo Mismatch',
  date_issue: 'Date Issue',
  missing_tags: 'Missing Tags',
  contact_invalid: 'Contact Invalid',
  ai_suggestion: 'AI Suggestion',
  duplicate: 'Duplicate',
  encoding_issue: 'Encoding Issue',
  outdated: 'Outdated',
  lgbti_relevance: 'LGBTI Relevance',
  sensitivity_legal: 'Legal',
  sensitivity_medical: 'Medical',
  sensitivity_nsfw: 'NSFW',
};

const SENSITIVITY_COLORS: Record<string, string> = {
  sensitivity_legal: '#DB2777',
  sensitivity_medical: '#0891b2',
  sensitivity_nsfw: '#e11d48',
  lgbti_relevance: '#d97706',
};

const REVIEW_PRIORITY_COLORS: Record<string, string> = {
  urgent: '#dc2626',
  high: '#ea580c',
  normal: '#f59e0b',
  low: '#6b7280',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  venues: 'Venue',
  events: 'Event',
  cities: 'City',
  countries: 'Country',
  personalities: 'Personality',
  news_articles: 'News',
};

export function AutoModerationQueue() {
  const { pendingFlags, stats, flagStats, isLoading, isReviewing, reviewFlag, bulkReviewFlags } =
    useAutomationMonitor();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [flagTypeFilter, setFlagTypeFilter] = useState<string>('');
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('');
  const [autoApproveThreshold, setAutoApproveThreshold] = useState(0.9);

  // Filter flags
  const filteredFlags = useMemo(() => {
    return pendingFlags.filter((f) => {
      if (severityFilter && f.severity !== severityFilter) return false;
      if (flagTypeFilter && f.flag_type !== flagTypeFilter) return false;
      if (contentTypeFilter && f.content_type !== contentTypeFilter) return false;
      return true;
    });
  }, [pendingFlags, severityFilter, flagTypeFilter, contentTypeFilter]);

  // Flags eligible for auto-approval
  const autoApprovable = useMemo(() => {
    return filteredFlags.filter(
      (f) => f.suggested_value && (f.confidence ?? 0) >= autoApproveThreshold,
    );
  }, [filteredFlags, autoApproveThreshold]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredFlags.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredFlags.map((f) => f.id));
    }
  };

  const handleAutoApproveAll = async () => {
    const ids = autoApprovable.map((f) => f.id);
    if (ids.length === 0) {
      toast.info('No flags meet the auto-approve threshold');
      return;
    }
    try {
      await bulkReviewFlags({ flagIds: ids, action: 'approved' });
      setSelectedIds([]);
    } catch {
      // Error handled by mutation
    }
  };

  // All flags that have suggested values (for "Apply All Enrichments")
  const allWithSuggestions = useMemo(() => {
    return filteredFlags.filter((f) => f.suggested_value);
  }, [filteredFlags]);

  const handleApplyAllEnrichments = async () => {
    const ids = allWithSuggestions.map((f) => f.id);
    if (ids.length === 0) {
      toast.info('No flags with suggested changes');
      return;
    }
    try {
      await bulkReviewFlags({ flagIds: ids, action: 'approved' });
      setSelectedIds([]);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDismissAll = async () => {
    const ids = filteredFlags.map((f) => f.id);
    if (ids.length === 0) return;
    try {
      await bulkReviewFlags({ flagIds: ids, action: 'rejected' });
      setSelectedIds([]);
    } catch {
      // Error handled by mutation
    }
  };

  const handleBulkAction = async (action: 'approved' | 'rejected') => {
    if (selectedIds.length === 0) return;
    try {
      await bulkReviewFlags({ flagIds: selectedIds, action });
      setSelectedIds([]);
    } catch {
      // Error handled by mutation
    }
  };

  const handleReview = async (flagId: string, action: 'approved' | 'rejected') => {
    try {
      await reviewFlag({ flagId, action });
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            <Bot
              style={{
                width: 22,
                height: 22,
                display: 'inline',
                marginRight: 8,
                verticalAlign: 'middle',
              }}
            />
            Automated Moderation
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {flagStats?.pending || 0} pending flags from automation modules
            {(flagStats?.applied || 0) > 0 && ` · ${flagStats?.applied} auto-applied`}
            {' · '}
            <MuiLink
              component={RouterLink}
              to="/admin/automation"
              underline="hover"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
            >
              <Settings size={12} />
              Configure modules
            </MuiLink>
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {selectedIds.length > 0 && (
            <>
              <Button size="sm" onClick={() => handleBulkAction('approved')}>
                <CheckCircle style={{ width: 14, height: 14, marginRight: 4 }} />
                Approve ({selectedIds.length})
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkAction('rejected')}>
                <XCircle style={{ width: 14, height: 14, marginRight: 4 }} />
                Reject ({selectedIds.length})
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* Auto-Approve Panel */}
      <Card sx={{ border: '1px solid', borderColor: '#DB2777', bgcolor: 'rgba(219, 39, 119, 0.04)' }}>
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ShieldCheck style={{ width: 18, height: 18, color: '#DB2777' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Auto-Approve High Confidence
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Approve all flags with confidence ≥ {(autoApproveThreshold * 100).toFixed(0)}% that
                have suggested changes.
                {autoApprovable.length > 0 && ` ${autoApprovable.length} flags eligible.`}
              </Typography>
              <Box sx={{ mt: 1, maxWidth: 300 }}>
                <Typography variant="caption" color="text.secondary">
                  Threshold: {(autoApproveThreshold * 100).toFixed(0)}%
                </Typography>
                <Slider
                  value={autoApproveThreshold}
                  onChange={(_, v) => setAutoApproveThreshold(v as number)}
                  min={0.5}
                  max={1.0}
                  step={0.05}
                  size="small"
                  sx={{ color: '#DB2777' }}
                />
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                onClick={handleAutoApproveAll}
                disabled={isReviewing || autoApprovable.length === 0}
              >
                <Zap style={{ width: 14, height: 14, marginRight: 4 }} />
                Auto-Approve ({autoApprovable.length})
              </Button>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  onClick={handleApplyAllEnrichments}
                  disabled={isReviewing || allWithSuggestions.length === 0}
                  variant="outline"
                  size="sm"
                >
                  <CheckCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                  Apply All Enrichments ({allWithSuggestions.length})
                </Button>
                <Button
                  onClick={handleDismissAll}
                  disabled={isReviewing || filteredFlags.length === 0}
                  variant="outline"
                  size="sm"
                >
                  <XCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                  Dismiss All ({filteredFlags.length})
                </Button>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Severity</InputLabel>
          <Select
            value={severityFilter}
            label="Severity"
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
            <MenuItem value="error">Error</MenuItem>
            <MenuItem value="warning">Warning</MenuItem>
            <MenuItem value="info">Info</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Flag Type</InputLabel>
          <Select
            value={flagTypeFilter}
            label="Flag Type"
            onChange={(e) => setFlagTypeFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {Object.entries(FLAG_TYPE_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Content Type</InputLabel>
          <Select
            value={contentTypeFilter}
            label="Content Type"
            onChange={(e) => setContentTypeFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {Object.entries(CONTENT_TYPE_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {isLoading && <LinearProgress />}

      {/* Flag list */}
      {filteredFlags.length === 0 && !isLoading ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Bot
            style={{
              width: 48,
              height: 48,
              color: '#d1d5db',
              marginBottom: 16,
              marginLeft: 'auto',
              marginRight: 'auto',
              display: 'block',
            }}
          />
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
            No pending automation flags
          </Typography>
          <Typography color="text.secondary">
            Automation modules haven't generated any flags needing review.
          </Typography>
        </Box>
      ) : (
        <>
          {/* Select all */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox
              checked={selectedIds.length === filteredFlags.length && filteredFlags.length > 0}
              indeterminate={selectedIds.length > 0 && selectedIds.length < filteredFlags.length}
              onChange={toggleSelectAll}
              size="small"
            />
            <Typography variant="body2" color="text.secondary">
              {selectedIds.length > 0
                ? `${selectedIds.length} selected`
                : `Select all (${filteredFlags.length})`}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {filteredFlags.map((flag) => (
              <FlagCard
                key={flag.id}
                flag={flag}
                selected={selectedIds.includes(flag.id)}
                expanded={expandedId === flag.id}
                onToggleSelect={() => toggleSelect(flag.id)}
                onToggleExpand={() => setExpandedId(expandedId === flag.id ? null : flag.id)}
                onApprove={() => handleReview(flag.id, 'approved')}
                onReject={() => handleReview(flag.id, 'rejected')}
                isReviewing={isReviewing}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

interface FlagCardProps {
  flag: ContentFlag;
  selected: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onApprove: () => void;
  onReject: () => void;
  isReviewing: boolean;
}

function FlagCard({
  flag,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
  onApprove,
  onReject,
  isReviewing,
}: FlagCardProps) {
  const SeverityIcon = SEVERITY_ICONS[flag.severity] || Info;
  const severityColor = SEVERITY_COLORS[flag.severity] || '#6b7280';
  const isClassifierFlag = flag.module_name === 'content-classifier';
  const sensitivityColor = SENSITIVITY_COLORS[flag.flag_type];
  const currentVal = flag.current_value as Record<string, unknown> | null;
  const reviewPriority = currentVal?.review_priority as string | undefined;

  return (
    <Card
      sx={{
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        '&:hover': { boxShadow: 2 },
        transition: 'all 200ms',
      }}
    >
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Checkbox checked={selected} onChange={onToggleSelect} size="small" sx={{ mt: -0.5 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Top row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
              <Chip
                icon={<SeverityIcon style={{ width: 12, height: 12 }} />}
                label={flag.severity}
                size="small"
                sx={{ bgcolor: severityColor, color: '#fff', fontWeight: 600, fontSize: '0.7rem' }}
              />
              <Chip
                icon={
                  flag.flag_type === 'sensitivity_legal' ? <Scale style={{ width: 12, height: 12 }} /> :
                  flag.flag_type === 'sensitivity_medical' ? <Heart style={{ width: 12, height: 12 }} /> :
                  flag.flag_type === 'sensitivity_nsfw' ? <EyeOff style={{ width: 12, height: 12 }} /> :
                  flag.flag_type === 'lgbti_relevance' ? <Flag style={{ width: 12, height: 12 }} /> :
                  undefined
                }
                label={FLAG_TYPE_LABELS[flag.flag_type] || flag.flag_type}
                size="small"
                variant="outlined"
                sx={sensitivityColor ? {
                  borderColor: sensitivityColor,
                  color: sensitivityColor,
                  fontWeight: 600,
                } : undefined}
              />
              <Chip
                label={CONTENT_TYPE_LABELS[flag.content_type] || flag.content_type}
                size="small"
                variant="outlined"
              />
              {flag.confidence != null && (
                <Chip
                  label={`${(flag.confidence * 100).toFixed(0)}%`}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontWeight: 600,
                    borderColor:
                      flag.confidence >= 0.9
                        ? '#16a34a'
                        : flag.confidence >= 0.7
                          ? '#f59e0b'
                          : '#ef4444',
                  }}
                />
              )}
              {reviewPriority && (
                <Chip
                  label={`Priority: ${reviewPriority}`}
                  size="small"
                  sx={{
                    bgcolor: REVIEW_PRIORITY_COLORS[reviewPriority] || '#6b7280',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.7rem',
                  }}
                />
              )}
              <Chip
                icon={<Bot style={{ width: 12, height: 12 }} />}
                label={flag.module_name.replace(/-/g, ' ')}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.7rem' }}
              />
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" color="text.secondary">
                {new Date(flag.created_at).toLocaleDateString()}{' '}
                {new Date(flag.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Typography>
            </Box>

            {/* Title */}
            <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
              {flag.title}
            </Typography>
            {flag.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {flag.description}
              </Typography>
            )}

            {/* Actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              {flag.suggested_value && (
                <Button size="sm" onClick={onApprove} disabled={isReviewing}>
                  <CheckCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                  Approve & Apply
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onReject} disabled={isReviewing}>
                <XCircle style={{ width: 12, height: 12, marginRight: 4 }} />
                Dismiss
              </Button>
              <IconButton size="small" onClick={onToggleExpand}>
                {expanded ? (
                  <ChevronUp style={{ width: 16, height: 16 }} />
                ) : (
                  <ChevronDown style={{ width: 16, height: 16 }} />
                )}
              </IconButton>
            </Box>

            {/* Expanded detail with diff */}
            <Collapse in={expanded}>
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 1 }}
                >
                  Content ID: {flag.content_id}
                </Typography>

                {/* Classifier-specific detail view */}
                {isClassifierFlag && currentVal && (
                  <Box sx={{ mb: 1.5 }}>
                    {/* Relevance score bar */}
                    {currentVal.lgbti_relevance_score != null && (
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                          LGBTI Relevance: {((currentVal.lgbti_relevance_score as number) * 100).toFixed(0)}%
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={(currentVal.lgbti_relevance_score as number) * 100}
                          sx={{
                            height: 8,
                            borderRadius: 4,
                            bgcolor: 'rgba(0,0,0,0.08)',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: (currentVal.lgbti_relevance_score as number) >= 0.7
                                ? '#16a34a'
                                : (currentVal.lgbti_relevance_score as number) >= 0.5
                                  ? '#f59e0b'
                                  : '#ef4444',
                              borderRadius: 4,
                            },
                          }}
                        />
                      </Box>
                    )}
                    {/* Reasoning */}
                    {currentVal.lgbti_reasoning && (
                      <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic', color: 'text.secondary' }}>
                        {String(currentVal.lgbti_reasoning)}
                      </Typography>
                    )}
                    {/* Sensitivity indicators */}
                    {currentVal.indicators && Array.isArray(currentVal.indicators) && (
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                          Detected indicators:
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {(currentVal.indicators as string[]).map((indicator, i) => (
                            <Chip
                              key={i}
                              label={indicator}
                              size="small"
                              sx={{
                                fontSize: '0.7rem',
                                bgcolor: sensitivityColor ? `${sensitivityColor}15` : undefined,
                                borderColor: sensitivityColor,
                                border: '1px solid',
                              }}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}
                    {/* Severity */}
                    {currentVal.severity && (
                      <Typography variant="caption" color="text.secondary">
                        Sensitivity severity: <strong>{String(currentVal.severity)}</strong>
                      </Typography>
                    )}
                  </Box>
                )}

                {/* Generic flag detail view (non-classifier flags) */}
                {!isClassifierFlag && flag.current_value && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, display: 'block', mb: 0.5, color: '#ef4444' }}
                    >
                      Current Value:
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        fontSize: '0.75rem',
                        overflow: 'auto',
                        maxHeight: 150,
                        p: 1,
                        bgcolor: 'rgba(239,68,68,0.05)',
                        borderRadius: 1,
                        border: '1px solid rgba(239,68,68,0.2)',
                      }}
                    >
                      {JSON.stringify(flag.current_value, null, 2)}
                    </Box>
                  </Box>
                )}

                {flag.suggested_value && (
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, display: 'block', mb: 0.5, color: '#16a34a' }}
                    >
                      Suggested Value:
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        fontSize: '0.75rem',
                        overflow: 'auto',
                        maxHeight: 150,
                        p: 1,
                        bgcolor: 'rgba(22,163,74,0.05)',
                        borderRadius: 1,
                        border: '1px solid rgba(22,163,74,0.2)',
                      }}
                    >
                      {JSON.stringify(flag.suggested_value, null, 2)}
                    </Box>
                  </Box>
                )}
              </Box>
            </Collapse>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default AutoModerationQueue;
