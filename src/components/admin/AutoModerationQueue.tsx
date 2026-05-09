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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

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
  sensitivity_legal: 'hsl(var(--foreground))',
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
  const { pendingFlags, stats: _stats, flagStats, isLoading, isReviewing, reviewFlag, bulkReviewFlags } =
    useAutomationMonitor();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [flagTypeFilter, setFlagTypeFilter] = useState<string>('all');
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');
  const [autoApproveThreshold, setAutoApproveThreshold] = useState(0.9);

  // Filter flags
  const filteredFlags = useMemo(() => {
    return pendingFlags.filter((f) => {
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
      if (flagTypeFilter !== 'all' && f.flag_type !== flagTypeFilter) return false;
      if (contentTypeFilter !== 'all' && f.content_type !== contentTypeFilter) return false;
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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bot className="w-[22px] h-[22px]" />
            Automated Moderation
          </h2>
          <p className="text-sm text-muted-foreground">
            {flagStats?.pending || 0} pending flags from automation modules
            {(flagStats?.applied || 0) > 0 && ` · ${flagStats?.applied} auto-applied`}
            {' · '}
            <RouterLink
              to="/admin/automation"
              className="inline-flex items-center gap-1 hover:underline text-[hsl(var(--foreground))]"
            >
              <Settings size={12} />
              Configure modules
            </RouterLink>
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {selectedIds.length > 0 && (
            <>
              <Button size="sm" onClick={() => handleBulkAction('approved')}>
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                Approve ({selectedIds.length})
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkAction('rejected')}>
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Reject ({selectedIds.length})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Auto-Approve Panel */}
      <Card
        style={{ borderColor: 'hsl(var(--foreground))', backgroundColor: 'hsl(var(--muted))' }}
        className="border"
      >
        <CardContent className="py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-[18px] h-[18px]" style={{ color: 'hsl(var(--foreground))' }} />
                <div className="text-sm font-semibold">Auto-Approve High Confidence</div>
              </div>
              <p className="text-xs text-muted-foreground">
                Approve all flags with confidence ≥ {(autoApproveThreshold * 100).toFixed(0)}% that
                have suggested changes.
                {autoApprovable.length > 0 && ` ${autoApprovable.length} flags eligible.`}
              </p>
              <div className="mt-2 max-w-[300px]">
                <Label className="text-xs text-muted-foreground">
                  Threshold: {(autoApproveThreshold * 100).toFixed(0)}%
                </Label>
                <Slider
                  value={[autoApproveThreshold]}
                  onValueChange={(v) => setAutoApproveThreshold(v[0])}
                  min={0.5}
                  max={1.0}
                  step={0.05}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleAutoApproveAll}
                disabled={isReviewing || autoApprovable.length === 0}
              >
                <Zap className="w-3.5 h-3.5 mr-1" />
                Auto-Approve ({autoApprovable.length})
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={handleApplyAllEnrichments}
                  disabled={isReviewing || allWithSuggestions.length === 0}
                  variant="outline"
                  size="sm"
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Apply All Enrichments ({allWithSuggestions.length})
                </Button>
                <Button
                  onClick={handleDismissAll}
                  disabled={isReviewing || filteredFlags.length === 0}
                  variant="outline"
                  size="sm"
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Dismiss All ({filteredFlags.length})
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <div className="min-w-[130px]">
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Select value={flagTypeFilter} onValueChange={setFlagTypeFilter}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Flag Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(FLAG_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[150px]">
          <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Content Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All content</SelectItem>
              {Object.entries(CONTENT_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="h-1 w-full overflow-hidden rounded bg-muted">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      )}

      {/* Flag list */}
      {filteredFlags.length === 0 && !isLoading ? (
        <div className="text-center py-16">
          <Bot className="w-12 h-12 text-gray-300 mb-4 mx-auto block" />
          <h3 className="text-base font-semibold mb-1">No pending automation flags</h3>
          <p className="text-muted-foreground">
            Automation modules haven't generated any flags needing review.
          </p>
        </div>
      ) : (
        <>
          {/* Select all */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={
                selectedIds.length === filteredFlags.length && filteredFlags.length > 0
                  ? true
                  : selectedIds.length > 0
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-muted-foreground">
              {selectedIds.length > 0
                ? `${selectedIds.length} selected`
                : `Select all (${filteredFlags.length})`}
            </span>
          </div>

          <div className="flex flex-col gap-3">
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
          </div>
        </>
      )}
    </div>
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
  const relevanceScore = currentVal?.lgbti_relevance_score as number | undefined;

  return (
    <Card
      className="border transition-all duration-200 hover:shadow-md"
      style={{ borderColor: selected ? 'hsl(var(--primary))' : undefined }}
    >
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-1" />
          <div className="flex-1 min-w-0">
            {/* Top row */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge
                style={{ backgroundColor: severityColor, color: '#fff' }}
                className="font-semibold text-[0.7rem] gap-1"
              >
                <SeverityIcon className="w-3 h-3" />
                {flag.severity}
              </Badge>
              <Badge
                variant="outline"
                style={
                  sensitivityColor
                    ? { borderColor: sensitivityColor, color: sensitivityColor }
                    : undefined
                }
                className="font-semibold gap-1"
              >
                {flag.flag_type === 'sensitivity_legal' ? (
                  <Scale className="w-3 h-3" />
                ) : flag.flag_type === 'sensitivity_medical' ? (
                  <Heart className="w-3 h-3" />
                ) : flag.flag_type === 'sensitivity_nsfw' ? (
                  <EyeOff className="w-3 h-3" />
                ) : flag.flag_type === 'lgbti_relevance' ? (
                  <Flag className="w-3 h-3" />
                ) : null}
                {FLAG_TYPE_LABELS[flag.flag_type] || flag.flag_type}
              </Badge>
              <Badge variant="outline">
                {CONTENT_TYPE_LABELS[flag.content_type] || flag.content_type}
              </Badge>
              {flag.confidence != null && (
                <Badge
                  variant="outline"
                  className="font-semibold"
                  style={{
                    borderColor:
                      flag.confidence >= 0.9
                        ? '#16a34a'
                        : flag.confidence >= 0.7
                          ? '#f59e0b'
                          : '#ef4444',
                  }}
                >
                  {(flag.confidence * 100).toFixed(0)}%
                </Badge>
              )}
              {reviewPriority && (
                <Badge
                  style={{
                    backgroundColor: REVIEW_PRIORITY_COLORS[reviewPriority] || '#6b7280',
                    color: '#fff',
                  }}
                  className="font-semibold text-[0.7rem]"
                >
                  Priority: {reviewPriority}
                </Badge>
              )}
              <Badge variant="outline" className="text-[0.7rem] gap-1">
                <Bot className="w-3 h-3" />
                {flag.module_name.replace(/-/g, ' ')}
              </Badge>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">
                {new Date(flag.created_at).toLocaleDateString()}{' '}
                {new Date(flag.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            {/* Title */}
            <p className="text-sm font-semibold mt-1">{flag.title}</p>
            {flag.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{flag.description}</p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-2">
              {flag.suggested_value && (
                <Button size="sm" onClick={onApprove} disabled={isReviewing}>
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Approve & Apply
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onReject} disabled={isReviewing}>
                <XCircle className="w-3 h-3 mr-1" />
                Dismiss
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleExpand}>
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Expanded detail with diff */}
            <Collapsible open={expanded}>
              <CollapsibleContent>
                <div className="mt-4 p-4 bg-muted rounded">
                  <p className="text-xs text-muted-foreground block mb-2">
                    Content ID: {flag.content_id}
                  </p>

                  {/* Classifier-specific detail view */}
                  {isClassifierFlag && currentVal && (
                    <div className="mb-3">
                      {/* Relevance score bar */}
                      {relevanceScore != null && (
                        <div className="mb-3">
                          <p className="text-xs font-semibold block mb-1">
                            LGBTI Relevance: {(relevanceScore * 100).toFixed(0)}%
                          </p>
                          <div className="h-2 w-full overflow-hidden rounded bg-black/10">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${relevanceScore * 100}%`,
                                backgroundColor:
                                  relevanceScore >= 0.7
                                    ? '#16a34a'
                                    : relevanceScore >= 0.5
                                      ? '#f59e0b'
                                      : '#ef4444',
                              }}
                            />
                          </div>
                        </div>
                      )}
                      {/* Reasoning */}
                      {currentVal.lgbti_reasoning && (
                        <p className="text-sm mb-2 italic text-muted-foreground">
                          {String(currentVal.lgbti_reasoning)}
                        </p>
                      )}
                      {/* Sensitivity indicators */}
                      {currentVal.indicators && Array.isArray(currentVal.indicators) && (
                        <div className="mb-2">
                          <p className="text-xs font-semibold block mb-1">Detected indicators:</p>
                          <div className="flex flex-wrap gap-1">
                            {(currentVal.indicators as string[]).map((indicator, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-[0.7rem]"
                                style={{
                                  backgroundColor: sensitivityColor
                                    ? `${sensitivityColor}15`
                                    : undefined,
                                  borderColor: sensitivityColor,
                                }}
                              >
                                {indicator}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Severity */}
                      {currentVal.severity && (
                        <p className="text-xs text-muted-foreground">
                          Sensitivity severity: <strong>{String(currentVal.severity)}</strong>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Generic flag detail view (non-classifier flags) */}
                  {!isClassifierFlag && flag.current_value && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold block mb-1 text-[#ef4444]">
                        Current Value:
                      </p>
                      <pre className="text-xs overflow-auto max-h-[150px] p-2 rounded border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.05)]">
                        {JSON.stringify(flag.current_value, null, 2)}
                      </pre>
                    </div>
                  )}

                  {flag.suggested_value && (
                    <div>
                      <p className="text-xs font-semibold block mb-1 text-[#16a34a]">
                        Suggested Value:
                      </p>
                      <pre className="text-xs overflow-auto max-h-[150px] p-2 rounded border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.05)]">
                        {JSON.stringify(flag.suggested_value, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AutoModerationQueue;
