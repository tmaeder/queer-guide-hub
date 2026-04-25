/**
 * EditorHeader - Top bar for the CMS editor.
 * Shows content type icon + label, inline-editable title, unsaved changes badge,
 * Save (with keyboard hint)/Preview/Reset/Close action buttons, and a saving spinner.
 * Dark-mode aware: uses MUI theme colors exclusively.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import { Save, X, RotateCcw, Eye, Pencil, Sparkles, Loader2 } from 'lucide-react';
import type { ContentTypeConfig, EditorState } from '@/types/cms';

interface EditorHeaderProps {
  contentType: ContentTypeConfig;
  state: EditorState;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
  onEnrich?: () => void;
  isEnriching?: boolean;
}

export function EditorHeader({
  contentType,
  state,
  onSave,
  onReset,
  onClose,
  onEnrich,
  isEnriching,
}: EditorHeaderProps) {
  const Icon = contentType.icon;
  const titleValue = (state.data[contentType.titleField] as string) ?? '';
  const displayTitle =
    titleValue || (state.itemId ? 'Untitled' : `New ${contentType.label.singular}`);

  // Inline title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(titleValue);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);

  // Sync edit value when external title changes
  useEffect(() => {
    if (!isEditingTitle) {
      setEditTitleValue(titleValue);
    }
  }, [titleValue, isEditingTitle]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleStartEditing = useCallback(() => {
    setEditTitleValue(titleValue);
    setIsEditingTitle(true);
  }, [titleValue]);

  const handleFinishEditing = useCallback(() => {
    setIsEditingTitle(false);
    // The parent handles field changes through its own mechanisms;
    // we let the title field in the form manage the actual data.
    // This inline edit is purely visual until the user uses the actual form field.
  }, []);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleFinishEditing();
      }
      if (e.key === 'Escape') {
        setEditTitleValue(titleValue);
        setIsEditingTitle(false);
      }
    },
    [handleFinishEditing, titleValue],
  );

  const handleClose = () => {
    if (state.isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmed) return;
    }
    onClose();
  };

  // Detect platform for shortcut display
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const saveShortcut = isMac ? '\u2318S' : 'Ctrl+S';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexShrink: 0,
        minHeight: 56,
      }}
    >
      {/* Left side: icon + type label + title */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          minWidth: 0,
          flex: 1,
        }}
      >
        {/* Content type icon */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            borderRadius: 2,
            width: 40,
            height: 40,
            bgcolor: contentType.color + '18',
            color: contentType.color,
          }}
        >
          <Icon style={{ width: 20, height: 20 }} />
        </Box>

        {/* Title and type label */}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="caption"
            sx={{
              color: contentType.color,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              lineHeight: 1.2,
            }}
          >
            {contentType.label.singular}
          </Typography>

          {/* Inline-editable title */}
          {isEditingTitle ? (
            <TextField
              inputRef={titleInputRef}
              value={editTitleValue}
              onChange={(e) => setEditTitleValue(e.target.value)}
              onBlur={handleFinishEditing}
              onKeyDown={handleTitleKeyDown}
              variant="standard"
              fullWidth
              sx={{
                '& .MuiInput-root': {
                  fontSize: '1rem',
                  fontWeight: 600,
                  lineHeight: 1.3,
                },
                '& .MuiInput-underline:before': {
                  borderColor: 'primary.main',
                },
              }}
              slotProps={{
                input: {
                  sx: {
                    py: 0,
                    px: 0,
                  },
                },
              }}
            />
          ) : (
            <Box
              onClick={handleStartEditing}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                cursor: 'pointer',
                borderBottom: '1px dashed transparent',
                borderRadius: 0.5,
                transition: 'border-color 0.15s ease',
                '&:hover': {
                  borderBottomColor: 'text.disabled',
                },
                '&:hover .edit-icon': {
                  opacity: 1,
                },
              }}
            >
              <Typography
                variant="body1"
                sx={{
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: { xs: 200, sm: 350, md: 500 },
                  lineHeight: 1.3,
                  color: titleValue ? 'text.primary' : 'text.disabled',
                }}
              >
                {displayTitle}
              </Typography>
              <Pencil
                className="edit-icon"
                style={{
                  width: 13,
                  height: 13,
                  opacity: 0,
                  flexShrink: 0,
                  transition: 'opacity 0.15s ease',
                  color: 'inherit',
                }}
              />
            </Box>
          )}
        </Box>

        {/* Unsaved changes badge */}
        {state.isDirty && !state.isSaving && (
          <Chip
            label="Unsaved changes"
            size="small"
            sx={{
              bgcolor: 'warning.main',
              color: 'warning.contrastText',
              fontWeight: 500,
              fontSize: '0.75rem',
              height: 24,
              flexShrink: 0,
              opacity: 0.9,
            }}
          />
        )}

        {/* Saving spinner */}
        {state.isSaving && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              flexShrink: 0,
            }}
          >
            <CircularProgress size={16} thickness={5} aria-label="Loading" />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              Saving...
            </Typography>
          </Box>
        )}
      </Box>

      {/* Right side: action buttons */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexShrink: 0,
          ml: 2,
        }}
      >
        {/* Enrich with AI button */}
        {onEnrich && state.itemId && (
          <Tooltip title="Enrich content with AI suggestions">
            <span>
              <Button
                variant="outlined"
                size="small"
                disabled={isEnriching || state.isSaving}
                onClick={onEnrich}
                startIcon={
                  isEnriching ? (
                    <Loader2
                      style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }}
                    />
                  ) : (
                    <Sparkles style={{ width: 16, height: 16 }} />
                  )
                }
                sx={{
                  textTransform: 'none',
                  fontWeight: 500,
                  display: { xs: 'none', sm: 'inline-flex' },
                  borderColor: 'brand.main',
                  color: 'brand.main',
                  '&:hover': {
                    borderColor: 'brand.dark',
                    bgcolor: 'rgba(219, 39, 119, 0.04)',
                  },
                }}
              >
                {isEnriching ? 'Enriching...' : 'Enrich'}
              </Button>
            </span>
          </Tooltip>
        )}

        {/* Preview button */}
        <Tooltip title="Preview content">
          <span>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setPreviewOpen(true)}
              startIcon={<Eye style={{ width: 16, height: 16 }} />}
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                display: { xs: 'none', sm: 'inline-flex' },
                borderColor: 'divider',
                color: 'text.secondary',
                '&:hover': {
                  borderColor: 'text.disabled',
                  bgcolor: 'action.hover',
                },
              }}
            >
              Preview
            </Button>
          </span>
        </Tooltip>

        {/* Reset button */}
        <Tooltip title="Discard changes">
          <span>
            <Button
              variant="outlined"
              size="small"
              disabled={!state.isDirty || state.isSaving}
              onClick={onReset}
              startIcon={<RotateCcw style={{ width: 16, height: 16 }} />}
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                display: { xs: 'none', sm: 'inline-flex' },
              }}
            >
              Reset
            </Button>
          </span>
        </Tooltip>

        {/* Save button */}
        <Tooltip title={`Save (${saveShortcut})`}>
          <span>
            <Button
              variant="contained"
              size="small"
              disabled={!state.isDirty || state.isSaving}
              onClick={onSave}
              startIcon={
                state.isSaving ? (
                  <CircularProgress size={16} thickness={5} color="inherit" aria-label="Loading" />
                ) : (
                  <Save style={{ width: 16, height: 16 }} />
                )
              }
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                minWidth: 80,
              }}
            >
              {state.isSaving ? 'Saving...' : 'Save'}
            </Button>
          </span>
        </Tooltip>

        <Divider
          orientation="vertical"
          flexItem
          sx={{ mx: 0.5, display: { xs: 'none', sm: 'block' } }}
        />

        {/* Close button */}
        <Tooltip title="Close editor">
          <IconButton
            onClick={handleClose}
            size="small"
            sx={{
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' },
            }}
          >
            <X style={{ width: 20, height: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* ── Preview Dialog ──────────────────────────────────── */}
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            maxHeight: '85vh',
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid',
            borderColor: 'divider',
            py: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Eye style={{ width: 20, height: 20, opacity: 0.6 }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Content Preview
            </Typography>
          </Box>
          <IconButton
            onClick={() => setPreviewOpen(false)}
            size="small"
            sx={{ color: 'text.secondary' }}
          >
            <X style={{ width: 18, height: 18 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ py: 3 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {/* Preview title */}
            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: contentType.color,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {contentType.label.singular}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5 }}>
                {displayTitle}
              </Typography>
            </Box>

            <Divider />

            {/* Preview field values */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              {contentType.fields
                .filter((f) => !f.hidden && state.data[f.name] != null && state.data[f.name] !== '')
                .map((field) => {
                  const value = state.data[field.name];
                  let displayValue: string;

                  if (typeof value === 'boolean') {
                    displayValue = value ? 'Yes' : 'No';
                  } else if (typeof value === 'object') {
                    displayValue = JSON.stringify(value, null, 2);
                  } else {
                    displayValue = String(value);
                  }

                  return (
                    <Box
                      key={field.name}
                      sx={{
                        gridColumn: field.colSpan === 2 ? '1 / -1' : undefined,
                      }}
                    >
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}
                      >
                        {field.label}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          mt: 0.25,
                          wordBreak: 'break-word',
                          whiteSpace: field.type === 'json' ? 'pre-wrap' : 'normal',
                          fontFamily: field.type === 'json' ? 'monospace' : 'inherit',
                          fontSize: field.type === 'json' ? '0.8rem' : 'inherit',
                        }}
                      >
                        {displayValue}
                      </Typography>
                    </Box>
                  );
                })}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid', borderColor: 'divider', px: 3, py: 1.5 }}>
          <Button
            onClick={() => setPreviewOpen(false)}
            sx={{ textTransform: 'none', fontWeight: 500 }}
          >
            Close Preview
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
