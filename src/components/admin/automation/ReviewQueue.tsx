/**
 * ReviewQueue — Table of pending content_changes with approve/reject actions.
 */

import { useState, useMemo } from 'react';
import { CheckCircle2, XCircle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
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
import type { ContentChange } from '@/hooks/useAutomation';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  changes: ContentChange[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBulkApprove: (ids: string[]) => void;
  onBulkReject: (ids: string[]) => void;
  onViewDetail: (change: ContentChange) => void;
  isApproving: boolean;
  isRejecting: boolean;
}

const CHANGE_TYPE_CLASS: Record<string, string> = {
  normalize: 'bg-blue-100 text-blue-800 border-blue-200',
  sanitize: 'bg-blue-100 text-blue-800 border-blue-200',
  enrich: 'bg-green-100 text-green-800 border-green-200',
  flag: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  ai_enhance: 'bg-muted text-muted-foreground',
};

export function ReviewQueue({
  changes,
  onApprove,
  onReject,
  onBulkApprove,
  onBulkReject,
  onViewDetail,
  isApproving,
  isRejecting,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');

  const filteredChanges = useMemo(() => {
    let result = changes;
    if (typeFilter !== 'all') result = result.filter((c) => c.change_type === typeFilter);
    if (contentTypeFilter !== 'all')
      result = result.filter((c) => c.content_type === contentTypeFilter);
    return result;
  }, [changes, typeFilter, contentTypeFilter]);

  const changeTypes = useMemo(() => [...new Set(changes.map((c) => c.change_type))], [changes]);
  const contentTypes = useMemo(() => [...new Set(changes.map((c) => c.content_type))], [changes]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredChanges.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredChanges.map((c) => c.id)));
    }
  };

  const selectedIds = [...selected];
  const hasSelection = selectedIds.length > 0;

  if (changes.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 size={48} style={{ color: '#10b981', margin: '0 auto 16px' }} />
        <h6 className="text-lg font-semibold text-muted-foreground">No pending changes</h6>
        <p className="text-sm text-muted-foreground">
          All automation changes have been reviewed.
        </p>
      </div>
    );
  }

  const confidenceColor = (c: number) =>
    c >= 0.9 ? 'bg-green-500' : c >= 0.7 ? 'bg-blue-500' : 'bg-yellow-500';

  return (
    <div className="flex flex-col gap-4">
      {/* Filters & bulk actions */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label className="text-xs">Change Type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {changeTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label className="text-xs">Content Type</Label>
          <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Content</SelectItem>
              {contentTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground ml-auto">
          {filteredChanges.length} pending
          {hasSelection && ` · ${selectedIds.length} selected`}
        </p>

        {hasSelection && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onBulkReject(selectedIds);
                setSelected(new Set());
              }}
              disabled={isRejecting}
            >
              <XCircle size={14} />
              Reject ({selectedIds.length})
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onBulkApprove(selectedIds);
                setSelected(new Set());
              }}
              disabled={isApproving}
            >
              <CheckCircle2 size={14} />
              Approve ({selectedIds.length})
            </Button>
          </>
        )}
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={selected.size === filteredChanges.length && filteredChanges.length > 0}
                onCheckedChange={toggleSelectAll}
              />
            </TableHead>
            <TableHead>Content</TableHead>
            <TableHead>Field</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Reasoning</TableHead>
            <TableHead>Age</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredChanges.map((change) => (
            <TableRow
              key={change.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onViewDetail(change)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selected.has(change.id)}
                  onCheckedChange={() => toggleSelect(change.id)}
                />
              </TableCell>
              <TableCell>
                <div>
                  <p className="text-sm font-semibold truncate max-w-[200px]">
                    {change.content_name}
                  </p>
                  <Badge variant="outline" className="h-[18px] text-[0.65rem] px-1.5">
                    {change.content_type}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <p className="text-sm font-mono text-[0.8rem]">{change.field_name}</p>
              </TableCell>
              <TableCell>
                <Badge
                  className={`h-[22px] text-[0.7rem] ${CHANGE_TYPE_CLASS[change.change_type] ?? 'bg-muted text-muted-foreground'}`}
                  variant="outline"
                >
                  {change.change_type}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 min-w-[80px]">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${confidenceColor(change.confidence)}`}
                      style={{ width: `${change.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold min-w-[32px]">
                    {Math.round(change.confidence * 100)}%
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <p className="text-xs text-muted-foreground truncate max-w-[250px] block">
                  {change.reasoning}
                </p>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(change.created_at), { addSuffix: true })}
                </span>
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-1 justify-end">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => onViewDetail(change)}
                      >
                        <Eye size={16} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View detail</TooltipContent>
                  </Tooltip>
                  {change.change_type !== 'flag' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-green-600"
                          onClick={() => onApprove(change.id)}
                          disabled={isApproving}
                        >
                          <CheckCircle2 size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Approve & apply</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => onReject(change.id)}
                        disabled={isRejecting}
                      >
                        <XCircle size={16} />
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
    </div>
  );
}
