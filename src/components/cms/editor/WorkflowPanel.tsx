/**
 * WorkflowPanel - Workflow state display and transition buttons.
 * Shows the current workflow state with a colored badge, available
 * transitions as action buttons, published timestamp, and a visibility
 * level selector. Uses the useCMSWorkflow hook for transition logic.
 */

import React, { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import { Clock, Eye, EyeOff, Lock, Globe } from 'lucide-react';
import { useCMSWorkflow } from '@/hooks/useCMSWorkflow';
import { getStateColor, getStateLabel } from '@/config/workflowConfig';
import { getContentType } from '@/config/contentTypeRegistry';
import type { WorkflowState, VisibilityLevel, WorkflowTransition } from '@/types/cms';
import { cn } from '@/lib/utils';

interface WorkflowPanelProps {
  contentType: string;
  itemId: string | null;
}

export function WorkflowPanel({ contentType, itemId }: WorkflowPanelProps) {
  const config = getContentType(contentType);

  // We need the metadata to determine current state. The parent EditorSidebar
  // doesn't pass it directly, so we re-derive it from the workflow hook which
  // reads the current state. For the initial render, default to 'draft'.
  //
  // The useCMSWorkflow hook is parameterised with the current workflow state.
  // Since we don't have direct access to metadata here, we manage a local
  // state that the parent can hydrate through the hook's transition results.

  const [currentState, setCurrentState] = useState<WorkflowState>('draft');
  const [publishedAt, setPublishedAt] = useState<string | undefined>(undefined);
  const [visibility, setVisibility] = useState<VisibilityLevel>('public');
  const [metadataLoaded, setMetadataLoaded] = useState(false);

  const {
    availableTransitions,
    transition,
    isTransitioning,
    error: workflowError,
  } = useCMSWorkflow(currentState);

  // Comment dialog state for transitions that require comments
  const [commentTarget, setCommentTarget] = useState<WorkflowTransition | null>(null);
  const [commentText, setCommentText] = useState('');

  // Load metadata on mount to get the real current state
  React.useEffect(() => {
    if (!itemId || !config) return;
    loadMetadata();
  }, [itemId, config]);

  const loadMetadata = useCallback(async () => {
    if (!itemId || !config) return;
    try {
      const { api } = await import('@/integrations/api/client');
      const { data } = await supabase
        .from('cms_content_metadata' as any)
        .select('workflow_state, visibility_level, published_at')
        .eq('source_table', config.tableName)
        .eq('source_id', itemId)
        .maybeSingle();

      if (data) {
        setCurrentState((data.workflow_state as WorkflowState) || 'draft');
        setVisibility((data.visibility_level as VisibilityLevel) || 'public');
        setPublishedAt(data.published_at || undefined);
      }
      setMetadataLoaded(true);
    } catch (err) {
      console.error('WorkflowPanel: failed to load metadata', err);
      setMetadataLoaded(true);
    }
  }, [itemId, config]);

  // Execute transition
  const handleTransition = useCallback(
    async (trans: WorkflowTransition, comment?: string) => {
      if (!itemId || !config) return;

      const success = await transition(
        config.tableName,
        itemId,
        trans.to,
        comment,
      );

      if (success) {
        setCurrentState(trans.to);
        if (trans.to === 'published') {
          setPublishedAt(new Date().toISOString());
        }
        setCommentTarget(null);
        setCommentText('');
      }
    },
    [itemId, config, transition],
  );

  // Handle transition button click
  const handleTransitionClick = useCallback(
    (trans: WorkflowTransition) => {
      if (trans.requiresComment) {
        setCommentTarget(trans);
        setCommentText('');
      } else {
        handleTransition(trans);
      }
    },
    [handleTransition],
  );

  // Handle visibility change
  const handleVisibilityChange = useCallback(
    async (newVisibility: VisibilityLevel) => {
      if (!itemId || !config) return;
      setVisibility(newVisibility);

      try {
        const { api } = await import('@/integrations/api/client');
        await supabase
          .from('cms_content_metadata' as any)
          .upsert(
            {
              source_table: config.tableName,
              source_id: itemId,
              visibility_level: newVisibility,
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
            { onConflict: 'source_table,source_id' },
          );
      } catch (err) {
        console.error('Failed to update visibility:', err);
      }
    },
    [itemId, config],
  );

  const stateColor = getStateColor(currentState);
  const stateLabel = getStateLabel(currentState);
  const isNewItem = !itemId;

  const visibilityIcon = visibility === 'public'
    ? <Globe style={{ width: 14, height: 14 }} />
    : visibility === 'private'
      ? <EyeOff style={{ width: 14, height: 14 }} />
      : <Lock style={{ width: 14, height: 14 }} />;

  return (
    <Box className="flex flex-col gap-3">
      {/* Current State */}
      <Box className="flex items-center justify-between">
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
          Status
        </Typography>
        <Chip
          label={stateLabel}
          size="small"
          icon={
            <Box
              component="span"
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: stateColor,
                display: 'inline-block',
                ml: 0.5,
              }}
            />
          }
          variant="outlined"
          sx={{
            borderColor: stateColor,
            color: stateColor,
            fontWeight: 600,
            fontSize: '0.75rem',
            '& .MuiChip-icon': { ml: 0.5 },
          }}
        />
      </Box>

      {/* Transition Buttons */}
      {!isNewItem && availableTransitions.length > 0 && (
        <>
          <Divider />
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                mb: 1,
                display: 'block',
              }}
            >
              Actions
            </Typography>
            <Stack spacing={1}>
              {availableTransitions.map((trans) => {
                const targetColor = getStateColor(trans.to);
                const isPublish = trans.to === 'published';

                return (
                  <Button
                    key={`${trans.from}-${trans.to}`}
                    variant={isPublish ? 'contained' : 'outlined'}
                    size="small"
                    fullWidth
                    disabled={isTransitioning}
                    onClick={() => handleTransitionClick(trans)}
                    startIcon={
                      isTransitioning ? (
                        <CircularProgress size={14} color="inherit" />
                      ) : (
                        <Box
                          component="span"
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: targetColor,
                            display: 'inline-block',
                          }}
                        />
                      )
                    }
                    sx={{
                      textTransform: 'none',
                      fontWeight: 500,
                      justifyContent: 'flex-start',
                      ...(isPublish
                        ? { bgcolor: '#22c55e', '&:hover': { bgcolor: '#16a34a' } }
                        : {}),
                    }}
                  >
                    {trans.label}
                  </Button>
                );
              })}
            </Stack>
          </Box>
        </>
      )}

      {/* Comment dialog for transitions that require it */}
      {commentTarget && (
        <>
          <Divider />
          <Box
            className={cn(
              'rounded-lg p-3',
              'bg-gray-50 border border-gray-200',
            )}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              {commentTarget.label}
            </Typography>
            {commentTarget.description && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                {commentTarget.description}
              </Typography>
            )}
            <TextField
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment explaining the requested changes..."
              size="small"
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
              sx={{
                mb: 1.5,
                '& .MuiOutlinedInput-root': { fontSize: '0.875rem' },
              }}
            />
            <Box className="flex gap-2">
              <Button
                variant="contained"
                size="small"
                disabled={isTransitioning || !commentText.trim()}
                onClick={() => handleTransition(commentTarget, commentText.trim())}
                sx={{
                  flex: 1,
                  textTransform: 'none',
                  fontWeight: 500,
                }}
              >
                {isTransitioning ? 'Processing...' : commentTarget.label}
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  setCommentTarget(null);
                  setCommentText('');
                }}
                sx={{ textTransform: 'none' }}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        </>
      )}

      {/* Error message */}
      {workflowError && (
        <Alert severity="error" sx={{ py: 0.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
          {workflowError}
        </Alert>
      )}

      <Divider />

      {/* Visibility Level */}
      <Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            mb: 1,
          }}
        >
          <Eye style={{ width: 12, height: 12 }} />
          Visibility
        </Typography>
        <Select
          value={visibility}
          onChange={(e) => handleVisibilityChange(e.target.value as VisibilityLevel)}
          size="small"
          fullWidth
          disabled={isNewItem}
          startAdornment={
            <Box sx={{ display: 'flex', mr: 0.5 }}>
              {visibilityIcon}
            </Box>
          }
          sx={{
            fontSize: '0.875rem',
            '& .MuiSelect-select': { py: 1 },
          }}
        >
          <MenuItem value="public">
            <Box className="flex items-center gap-2">
              <Globe style={{ width: 14, height: 14, color: '#22c55e' }} />
              <span>Public</span>
            </Box>
          </MenuItem>
          <MenuItem value="private">
            <Box className="flex items-center gap-2">
              <EyeOff style={{ width: 14, height: 14, color: '#f59e0b' }} />
              <span>Private</span>
            </Box>
          </MenuItem>
          <MenuItem value="restricted">
            <Box className="flex items-center gap-2">
              <Lock style={{ width: 14, height: 14, color: '#ef4444' }} />
              <span>Restricted</span>
            </Box>
          </MenuItem>
        </Select>
      </Box>

      {/* Published Timestamp */}
      {publishedAt && (
        <>
          <Divider />
          <Box className="flex items-center justify-between">
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              <Clock style={{ width: 12, height: 12 }} />
              Published
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 500 }}>
              {formatDatetime(publishedAt)}
            </Typography>
          </Box>
        </>
      )}

      {/* New item notice */}
      {isNewItem && (
        <Typography variant="caption" color="text.secondary">
          Save the item first to manage workflow and visibility.
        </Typography>
      )}
    </Box>
  );
}

// ── Utility ──────────────────────────────────────────────────────────

function formatDatetime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}
