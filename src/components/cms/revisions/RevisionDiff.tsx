/**
 * RevisionDiff
 * Field-level diff display between two revisions.
 * Shows old (red) and new (green) values for each changed field.
 */

import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import { X } from 'lucide-react';

interface RevisionDiffProps {
  changes: Record<string, { old: unknown; new: unknown }>;
  onClose: () => void;
}

/** Format a value for display. JSON objects are pretty-printed. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Compute a simple inline diff for two strings.
 * Returns an array of segments: { text, type: 'same' | 'removed' | 'added' }.
 * This is a word-level diff using a basic LCS approach.
 */
interface DiffSegment {
  text: string;
  type: 'same' | 'removed' | 'added';
}

function computeInlineDiff(oldStr: string, newStr: string): DiffSegment[] {
  const oldWords = oldStr.split(/(\s+)/);
  const newWords = newStr.split(/(\s+)/);

  // Simple LCS-based word diff
  const m = oldWords.length;
  const n = newWords.length;

  // For very long strings, fall back to block diff
  if (m > 500 || n > 500) {
    const segments: DiffSegment[] = [];
    if (oldStr) segments.push({ text: oldStr, type: 'removed' });
    if (newStr) segments.push({ text: newStr, type: 'added' });
    return segments;
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const segments: DiffSegment[] = [];
  let i = m;
  let j = n;
  const stack: DiffSegment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      stack.push({ text: oldWords[i - 1], type: 'same' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ text: newWords[j - 1], type: 'added' });
      j--;
    } else {
      stack.push({ text: oldWords[i - 1], type: 'removed' });
      i--;
    }
  }

  // Reverse and merge adjacent segments of the same type
  stack.reverse();
  for (const seg of stack) {
    if (segments.length > 0 && segments[segments.length - 1].type === seg.type) {
      segments[segments.length - 1].text += seg.text;
    } else {
      segments.push({ ...seg });
    }
  }

  return segments;
}

function InlineDiff({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const segments = computeInlineDiff(oldStr, newStr);

  return (
    <Typography
      variant="body2"
      component="div"
      sx={{ fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
    >
      {segments.map((seg, idx) => {
        if (seg.type === 'removed') {
          return (
            <Box
              key={idx}
              component="span"
              sx={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#dc2626',
                textDecoration: 'line-through',
                borderRadius: '2px',
                px: 0.25,
              }}
            >
              {seg.text}
            </Box>
          );
        }
        if (seg.type === 'added') {
          return (
            <Box
              key={idx}
              component="span"
              sx={{
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#16a34a',
                borderRadius: '2px',
                px: 0.25,
              }}
            >
              {seg.text}
            </Box>
          );
        }
        return <span key={idx}>{seg.text}</span>;
      })}
    </Typography>
  );
}

export function RevisionDiff({ changes, onClose }: RevisionDiffProps) {
  const fieldNames = Object.keys(changes);

  if (fieldNames.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Changes
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          No changes detected.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Changes ({fieldNames.length} field{fieldNames.length !== 1 ? 's' : ''})
        </Typography>
        <Tooltip title="Close diff">
          <IconButton size="small" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack spacing={2} divider={<Divider />}>
        {fieldNames.map((field) => {
          const { old: oldVal, new: newVal } = changes[field];
          const oldStr = formatValue(oldVal);
          const newStr = formatValue(newVal);
          const isStringDiff =
            typeof oldVal === 'string' && typeof newVal === 'string';

          return (
            <Box key={field}>
              <Typography
                variant="caption"
                fontWeight={600}
                color="text.secondary"
                sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1, display: 'block' }}
              >
                {field.replace(/_/g, ' ')}
              </Typography>

              {isStringDiff ? (
                <InlineDiff oldStr={oldStr} newStr={newStr} />
              ) : (
                <Stack spacing={1}>
                  {/* Old value */}
                  <Box
                    sx={{
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: 1,
                      p: 1.5,
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="error.main"
                      fontWeight={600}
                      sx={{ display: 'block', mb: 0.5 }}
                    >
                      Removed
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {oldStr}
                    </Typography>
                  </Box>

                  {/* New value */}
                  <Box
                    sx={{
                      backgroundColor: 'rgba(34, 197, 94, 0.08)',
                      border: '1px solid rgba(34, 197, 94, 0.2)',
                      borderRadius: 1,
                      p: 1.5,
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="success.main"
                      fontWeight={600}
                      sx={{ display: 'block', mb: 0.5 }}
                    >
                      Added
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {newStr}
                    </Typography>
                  </Box>
                </Stack>
              )}
            </Box>
          );
        })}
      </Stack>

      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" onClick={onClose} color="inherit">
          Close
        </Button>
      </Box>
    </Paper>
  );
}
