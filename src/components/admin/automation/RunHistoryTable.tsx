/**
 * RunHistoryTable — Displays automation_run_log entries.
 */

import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import { Clock } from 'lucide-react';
import type { AutomationRunLog, AutomationModule } from '@/hooks/useAutomation';
import { format, formatDistanceToNow } from 'date-fns';

interface Props {
  runs: AutomationRunLog[];
  modules: AutomationModule[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function RunHistoryTable({ runs, modules }: Props) {
  const moduleMap = useMemo(() => {
    const map = new Map<string, AutomationModule>();
    for (const m of modules) map.set(m.id, m);
    return map;
  }, [modules]);

  if (runs.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Clock size={48} style={{ color: '#94a3b8', margin: '0 auto 16px' }} />
        <Typography variant="h6" color="text.secondary">
          No run history yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Run a module to see execution logs here.
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Module</TableCell>
            <TableCell>Time</TableCell>
            <TableCell align="right">Scanned</TableCell>
            <TableCell align="right">Proposed</TableCell>
            <TableCell align="right">Auto-Approved</TableCell>
            <TableCell align="right">Pending</TableCell>
            <TableCell align="right">Errors</TableCell>
            <TableCell align="right">Duration</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.map((run) => {
            const mod = moduleMap.get(run.module_id);
            const hasErrors = run.errors > 0;
            return (
              <TableRow key={run.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    {mod?.display_name ?? run.module_id.slice(0, 8)}
                  </Typography>
                  {run.content_type && (
                    <Chip
                      label={run.content_type}
                      size="small"
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.65rem', mt: 0.25 }}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="caption" title={format(new Date(run.created_at), 'PPpp')}>
                    {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{run.items_scanned}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={run.changes_proposed > 0 ? 600 : 400}>
                    {run.changes_proposed}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="body2"
                    color={run.changes_auto_approved > 0 ? 'success.main' : 'text.secondary'}
                  >
                    {run.changes_auto_approved}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="body2"
                    color={run.changes_pending_review > 0 ? 'warning.main' : 'text.secondary'}
                  >
                    {run.changes_pending_review}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {hasErrors ? (
                    <Chip
                      label={run.errors}
                      size="small"
                      color="error"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      0
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption" fontFamily="monospace">
                    {formatDuration(run.duration_ms)}
                  </Typography>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
