/**
 * AutomationDashboard — Admin dashboard for the background automation system.
 */

import React, { useState } from 'react';
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
  Loader2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useAutomationMonitor,
  type AutomationModule,
  type ContentFlag,
} from '@/hooks/useAutomationMonitor';
import { formatDistanceToNow } from 'date-fns';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  content_quality: Shield,
  link_validation: Link2,
  geo_enrichment: MapPin,
  date_normalization: Calendar,
  tagging: Tag,
  contact_normalization: Phone,
  ai_enhancement: Bot,
};

const SEVERITY_CLASS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  critical: 'bg-red-100 text-red-800',
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
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stats Overview */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
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
      </div>

      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="review">
            Review Queue
            {stats.pendingFlags > 0 && (
              <Badge variant="destructive" className="ml-2 px-1 text-[0.65rem]">
                {stats.pendingFlags}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="links">Link Health</TabsTrigger>
          <TabsTrigger value="geo">Geo Validation</TabsTrigger>
        </TabsList>

        {/* Modules Tab */}
        <TabsContent value="modules">
          <div className="flex flex-col gap-4">
            {modules.map((mod) => {
              const CategoryIcon = CATEGORY_ICONS[mod.category] || Zap;
              return (
                <Card key={mod.id}>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div
                        className="p-2 rounded-element flex"
                        style={{ backgroundColor: mod.is_enabled ? '#dcfce7' : '#f3f4f6' }}
                      >
                        <CategoryIcon
                          size={20}
                          style={{ color: mod.is_enabled ? '#16a34a' : '#9ca3af' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-[0.95rem]">{mod.display_name}</p>
                          {mod.schedule && (
                            <Badge variant="outline" className="text-[0.7rem] h-5">
                              {mod.schedule}
                            </Badge>
                          )}
                          {mod.auto_approve && (
                            <Badge className="bg-green-100 text-green-800 text-[0.7rem] h-5">
                              Auto-approve
                            </Badge>
                          )}
                        </div>
                        <p className="text-[0.8rem] text-muted-foreground mt-0.5">
                          {mod.description}
                        </p>
                        <div className="flex gap-4 mt-1 text-[0.75rem] text-muted-foreground flex-wrap items-center">
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
                            <Badge
                              className={`text-[0.65rem] h-[18px] ${
                                mod.last_run_status === 'success'
                                  ? 'bg-green-100 text-green-800'
                                  : mod.last_run_status === 'partial'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {mod.last_run_status}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setConfigModule(mod)}
                            >
                              <Settings size={16} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Configure module</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              disabled={!mod.is_enabled || isTriggering}
                              onClick={() => triggerModule(mod.name)}
                            >
                              <Play size={16} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Trigger now</TooltipContent>
                        </Tooltip>
                        <Switch
                          checked={mod.is_enabled}
                          disabled={isToggling}
                          onCheckedChange={() =>
                            toggleModule({ moduleId: mod.id, enabled: !mod.is_enabled })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Review Queue Tab */}
        <TabsContent value="review">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Review Queue</CardTitle>
                  <CardDescription>
                    {stats.pendingFlags} pending &middot; {stats.appliedFlags} applied &middot;{' '}
                    {flagStats?.rejected || 0} rejected
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {pendingFlags.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 size={40} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                  <p>No pending items. All caught up!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Content</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingFlags.map((flag) => (
                      <TableRow key={flag.id}>
                        <TableCell>
                          <Badge variant="secondary" className="text-[0.7rem]">
                            {FLAG_TYPE_LABELS[flag.flag_type] || flag.flag_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p
                            className="text-[0.85rem] font-medium cursor-pointer hover:underline"
                            onClick={() => setSelectedFlag(flag)}
                          >
                            {flag.title}
                          </p>
                          {flag.description && (
                            <p className="text-[0.75rem] text-muted-foreground mt-0.5">
                              {flag.description.slice(0, 80)}
                              {flag.description.length > 80 ? '...' : ''}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[0.65rem]">
                            {flag.content_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-[0.65rem] ${SEVERITY_CLASS[flag.severity] ?? ''}`}
                          >
                            {flag.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {flag.confidence != null
                            ? `${(flag.confidence * 100).toFixed(0)}%`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <span className="text-[0.75rem] text-muted-foreground">
                            {formatDistanceToNow(new Date(flag.created_at), { addSuffix: true })}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => setSelectedFlag(flag)}
                                >
                                  <Eye size={14} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View details</TooltipContent>
                            </Tooltip>
                            {flag.suggested_value && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-green-600"
                                    disabled={isReviewing}
                                    onClick={() =>
                                      reviewFlag({ flagId: flag.id, action: 'approved' })
                                    }
                                  >
                                    <ThumbsUp size={14} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Approve & Apply</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-destructive"
                                  disabled={isReviewing}
                                  onClick={() =>
                                    reviewFlag({ flagId: flag.id, action: 'rejected' })
                                  }
                                >
                                  <ThumbsDown size={14} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Reject</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Link Health Tab */}
        <TabsContent value="links">
          <Card>
            <CardHeader>
              <CardTitle>Dead & Broken Links</CardTitle>
              <CardDescription>{deadLinks.length} broken links found</CardDescription>
            </CardHeader>
            <CardContent>
              {linksLoading ? (
                <div className="h-1 w-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary animate-pulse" />
                </div>
              ) : deadLinks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Link2 size={40} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                  <p>All links are healthy!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Content</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Checked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deadLinks.map((link) => (
                      <TableRow key={link.id}>
                        <TableCell>
                          <Badge variant="outline" className="text-[0.65rem]">
                            {link.content_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-[0.8rem]">{link.field_name}</span>
                        </TableCell>
                        <TableCell>
                          <span
                            className="text-[0.75rem] font-mono truncate block max-w-[300px]"
                            title={link.original_url}
                          >
                            {link.original_url}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-[0.65rem] ${link.http_status ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}
                          >
                            {link.http_status || 'Timeout'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-[0.75rem] text-muted-foreground">
                            {link.response_time_ms ? `${link.response_time_ms}ms` : '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-[0.75rem] text-destructive truncate block max-w-[200px]">
                            {link.error_message || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-[0.75rem] text-muted-foreground">
                            {formatDistanceToNow(new Date(link.last_checked_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Geo Validation Tab */}
        <TabsContent value="geo">
          <Card>
            <CardHeader>
              <CardTitle>Geographic Mismatches</CardTitle>
              <CardDescription>{geoMismatches.length} mismatches detected</CardDescription>
            </CardHeader>
            <CardContent>
              {geoLoading ? (
                <div className="h-1 w-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary animate-pulse" />
                </div>
              ) : geoMismatches.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Globe size={40} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                  <p>No geographic mismatches found!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Content</TableHead>
                      <TableHead>Geocoded Location</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Mismatch</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Validated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {geoMismatches.map((geo) => (
                      <TableRow key={geo.id}>
                        <TableCell>
                          <Badge variant="outline" className="text-[0.65rem]">
                            {geo.content_type}
                          </Badge>
                          <span className="text-[0.7rem] text-muted-foreground font-mono block">
                            {geo.content_id.slice(0, 8)}...
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-[0.8rem]">
                            {[geo.city, geo.region].filter(Boolean).join(', ')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-[0.8rem]">
                            {geo.country} {geo.country_code ? `(${geo.country_code})` : ''}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-[0.75rem] text-yellow-700 max-w-[250px] block">
                            {geo.mismatch_details}
                          </span>
                        </TableCell>
                        <TableCell>
                          {geo.confidence != null
                            ? `${(geo.confidence * 100).toFixed(0)}%`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <span className="text-[0.75rem] text-muted-foreground">
                            {formatDistanceToNow(new Date(geo.last_validated_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

      <ModuleConfigDialog
        module={configModule}
        onClose={() => setConfigModule(null)}
        onSave={(id, updates) => {
          updateModuleConfig({ moduleId: id, updates });
          setConfigModule(null);
        }}
      />
    </div>
  );
}

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
        <div className="flex items-center justify-between">
          <span className="text-[0.75rem] text-muted-foreground">{label}</span>
          <Icon size={14} style={{ color: color || 'var(--muted-foreground)' }} />
        </div>
        <p className="text-[1.3rem] font-bold" style={{ color: color || 'inherit' }}>
          {value.toLocaleString()}
          {total != null && (
            <span className="text-[0.75rem] text-muted-foreground ml-1 font-normal">
              / {total}
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

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
    <Dialog open={!!flag} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} />
              {flag.title}
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary">{FLAG_TYPE_LABELS[flag.flag_type] || flag.flag_type}</Badge>
            <Badge className={SEVERITY_CLASS[flag.severity] ?? ''}>{flag.severity}</Badge>
            <Badge variant="outline">{flag.content_type}</Badge>
            <Badge variant="outline">Module: {flag.module_name}</Badge>
            {flag.confidence != null && (
              <Badge variant="outline">
                Confidence: {(flag.confidence * 100).toFixed(0)}%
              </Badge>
            )}
          </div>

          {flag.description && (
            <p className="text-[0.9rem] text-muted-foreground">{flag.description}</p>
          )}

          {flag.current_value && (
            <div>
              <p className="font-semibold text-[0.85rem] mb-1">Current Value</p>
              <div
                className="p-3 rounded font-mono text-[0.8rem] whitespace-pre-wrap break-all"
                style={{ backgroundColor: '#fef2f2' }}
              >
                {JSON.stringify(flag.current_value, null, 2)}
              </div>
            </div>
          )}

          {flag.suggested_value && (
            <div>
              <p className="font-semibold text-[0.85rem] mb-1">Suggested Value</p>
              <div
                className="p-3 rounded font-mono text-[0.8rem] whitespace-pre-wrap break-all"
                style={{ backgroundColor: '#f0fdf4' }}
              >
                {JSON.stringify(flag.suggested_value, null, 2)}
              </div>
            </div>
          )}

          <p className="text-[0.75rem] text-muted-foreground">
            Content ID: {flag.content_id} &middot; Created{' '}
            {formatDistanceToNow(new Date(flag.created_at), { addSuffix: true })}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="outline"
            style={{ borderColor: '#ef4444', color: '#ef4444' }}
            disabled={isReviewing}
            onClick={() => onReject(flag.id)}
          >
            <ThumbsDown size={14} />
            Reject
          </Button>
          {flag.suggested_value && (
            <Button disabled={isReviewing} onClick={() => onApprove(flag.id)}>
              <ThumbsUp size={14} />
              Approve & Apply
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
    <Dialog open={!!mod} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Settings size={20} />
              Configure: {mod.display_name}
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-6 mt-4">
          <div>
            <p className="text-[0.85rem] font-medium mb-1">
              Confidence Threshold: {threshold.toFixed(0)}%
            </p>
            <p className="text-[0.75rem] text-muted-foreground mb-2">
              Changes above this confidence level can be auto-approved
            </p>
            <Slider
              value={[threshold]}
              onValueChange={([v]) => setThreshold(v)}
              min={50}
              max={100}
              step={5}
            />
            <div className="flex justify-between text-[0.7rem] text-muted-foreground mt-1">
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          <div>
            <p className="text-[0.85rem] font-medium mb-1">Batch Size: {batchSize}</p>
            <p className="text-[0.75rem] text-muted-foreground mb-2">
              Number of items to process per run
            </p>
            <Slider
              value={[batchSize]}
              onValueChange={([v]) => setBatchSize(v)}
              min={10}
              max={500}
              step={10}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.85rem] font-medium">Auto-Approve</p>
              <p className="text-[0.75rem] text-muted-foreground">
                Automatically apply changes above confidence threshold
              </p>
            </div>
            <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
          </div>
        </div>
        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AutomationDashboard;
