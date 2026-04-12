/**
 * ReviewQueue — Table of pending content_changes with approve/reject actions.
 */

import React, { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Checkbox from '@mui/material/Checkbox';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import LinearProgress from '@mui/material/LinearProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import { CheckCircle2, XCircle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const CHANGE_TYPE_COLOR: Record<string, 'info' | 'success' | 'warning' | 'error' | 'default'> = {
  normalize: 'info',
  sanitize: 'info',
  enrich: 'success',
  flag: 'warning',
  ai_enhance: 'default',
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
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <CheckCircle2 size={48} style={{ color: '#10b981', margin: '0 auto 16px' }} />
        <Typography variant="h6" color="text.secondary">
          No pending changes
        </Typography>
        <Typography variant="body2" color="text.secondary">
          All automation changes have been reviewed.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Filters & bulk actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Change Type</InputLabel>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            label="Change Type"
          >
            <MenuItem value="all">All Types</MenuItem>
            {changeTypes.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Content Type</InputLabel>
          <Select
            value={contentTypeFilter}
            onChange={(e) => setContentTypeFilter(e.target.value)}
            label="Content Type"
          >
            <MenuItem value="all">All Content</MenuItem>
            {contentTypes.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredChanges.length} pending
          {hasSelection && ` · ${selectedIds.length} selected`}
        </Typography>

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
      </Box>

      {/* Table */}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  checked={selected.size === filteredChanges.length && filteredChanges.length > 0}
                  indeterminate={selected.size > 0 && selected.size < filteredChanges.length}
                  onChange={toggleSelectAll}
                />
              </TableCell>
              <TableCell>Content</TableCell>
              <TableCell>Field</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Confidence</TableCell>
              <TableCell>Reasoning</TableCell>
              <TableCell>Age</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredChanges.map((change) => (
              <TableRow
                key={change.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => onViewDetail(change)}
              >
                <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    size="small"
                    checked={selected.has(change.id)}
                    onChange={() => toggleSelect(change.id)}
                  />
                </TableCell>
                <TableCell>
                  <Box>
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 200 }}>
                      {change.content_name}
                    </Typography>
                    <Chip
                      label={change.content_type}
                      size="small"
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.65rem' }}
                    />
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                    {change.field_name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={change.change_type}
                    size="small"
                    color={CHANGE_TYPE_COLOR[change.change_type] ?? 'default'}
                    sx={{ height: 22, fontSize: '0.7rem' }}
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 80 }}>
                    <LinearProgress
                      variant="determinate"
                      value={change.confidence * 100}
                      sx={{ flex: 1, height: 6, borderRadius: 3 }}
                      color={
                        change.confidence >= 0.9
                          ? 'success'
                          : change.confidence >= 0.7
                            ? 'info'
                            : 'warning'
                      }
                    />
                    <Typography variant="caption" fontWeight={600} sx={{ minWidth: 32 }}>
                      {Math.round(change.confidence * 100)}%
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    sx={{ maxWidth: 250, display: 'block' }}
                  >
                    {change.reasoning}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {formatDistanceToNow(new Date(change.created_at), { addSuffix: true })}
                  </Typography>
                </TableCell>
                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                    <Tooltip title="View detail">
                      <IconButton size="small" onClick={() => onViewDetail(change)}>
                        <Eye size={16} />
                      </IconButton>
                    </Tooltip>
                    {change.change_type !== 'flag' && (
                      <Tooltip title="Approve & apply">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => onApprove(change.id)}
                          disabled={isApproving}
                        >
                          <CheckCircle2 size={16} />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Reject">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => onReject(change.id)}
                        disabled={isRejecting}
                      >
                        <XCircle size={16} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
