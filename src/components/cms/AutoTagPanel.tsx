/**
 * AutoTagPanel — AI tag suggestion card for the CMS editor sidebar.
 *
 * Shows a "Suggest Tags" button that calls auto-tag-content in dry_run mode,
 * displays suggestions with confidence scores and checkboxes, then lets the
 * user apply selected tags.
 */

import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Check, Loader2, AlertCircle } from 'lucide-react';
import { useAutoTag, type TagSuggestion } from '@/hooks/useAutoTag';

interface AutoTagPanelProps {
  contentType: string;
  contentId: string;
  onTagsApplied?: () => void;
}

/** Confidence → color mapping */
function confidenceColor(c: number): string {
  if (c >= 0.85) return '#16a34a'; // green
  if (c >= 0.6) return '#ca8a04';  // amber
  return '#dc2626';                 // red
}

function confidenceLabel(c: number): string {
  return `${Math.round(c * 100)}%`;
}

export function AutoTagPanel({ contentType, contentId, onTagsApplied }: AutoTagPanelProps) {
  const { loading, suggestions, suggestTags, applyTags, clearSuggestions } = useAutoTag();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleSuggest = useCallback(async () => {
    setApplied(false);
    setSelected(new Set());
    const result = await suggestTags(contentType, contentId);
    if (result?.tags) {
      // Pre-select high confidence tags
      const highConf = new Set(
        result.tags
          .filter(t => t.confidence >= 0.85)
          .map(t => t.name)
      );
      setSelected(highConf);
    }
  }, [contentType, contentId, suggestTags]);

  const handleToggle = (tagName: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tagName)) {
        next.delete(tagName);
      } else {
        next.add(tagName);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (suggestions?.tags) {
      setSelected(new Set(suggestions.tags.map(t => t.name)));
    }
  };

  const handleApply = async () => {
    if (!suggestions || selected.size === 0) return;
    setApplying(true);
    try {
      // Apply with threshold 0 so all get auto-approved
      const result = await applyTags(contentType, contentId, 0);
      if (result?.success) {
        setApplied(true);
        onTagsApplied?.();
      }
    } finally {
      setApplying(false);
    }
  };

  const tags = suggestions?.tags || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Sparkles style={{ height: 16, width: 16, color: 'var(--mui-palette-primary-main)' }} />
            AI Tag Suggestions
          </Box>
        </CardTitle>
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Initial state: show suggest button */}
        {!suggestions && !loading && !applied && (
          <Button
            variant="outline"
            size="sm"
            sx={{ width: '100%' }}
            onClick={handleSuggest}
          >
            <Sparkles style={{ height: 14, width: 14, marginRight: 6 }} />
            Suggest Tags
          </Button>
        )}

        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 2 }}>
            <Loader2 style={{ height: 20, width: 20, animation: 'spin 1s linear infinite' }} />
            <Typography variant="caption" color="text.secondary">
              Analyzing content…
            </Typography>
          </Box>
        )}

        {/* Suggestions list */}
        {tags.length > 0 && !applied && (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {tags.map((tag: TagSuggestion) => (
                <Box
                  key={tag.name}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    py: 0.25,
                    px: 0.5,
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={selected.has(tag.name)}
                        onChange={() => handleToggle(tag.name)}
                        sx={{ p: 0.25 }}
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                          {tag.name}
                        </Typography>
                        <Box
                          component="span"
                          sx={{
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            color: confidenceColor(tag.confidence),
                            lineHeight: 1,
                          }}
                        >
                          {confidenceLabel(tag.confidence)}
                        </Box>
                        {tag.is_new && (
                          <Badge
                            variant="outline"
                            style={{
                              fontSize: '0.625rem',
                              padding: '0 4px',
                              lineHeight: '1.25rem',
                            }}
                          >
                            NEW
                          </Badge>
                        )}
                      </Box>
                    }
                    sx={{ m: 0, flex: 1 }}
                  />
                </Box>
              ))}
            </Box>

            {/* Action buttons */}
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              <Button
                size="sm"
                sx={{ flex: 1 }}
                onClick={handleApply}
                disabled={applying || selected.size === 0}
              >
                {applying ? (
                  <Loader2 style={{ height: 14, width: 14, marginRight: 4, animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Check style={{ height: 14, width: 14, marginRight: 4 }} />
                )}
                Apply {selected.size > 0 ? `(${selected.size})` : ''}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={applying}
              >
                All
              </Button>
            </Box>
          </>
        )}

        {/* No suggestions */}
        {suggestions && tags.length === 0 && !loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
            <AlertCircle style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
            <Typography variant="caption" color="text.secondary">
              No tags suggested for this item
            </Typography>
          </Box>
        )}

        {/* Applied state */}
        {applied && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
              <Check style={{ height: 14, width: 14, color: '#16a34a' }} />
              <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 500 }}>
                Tags applied successfully
              </Typography>
            </Box>
            <Button
              variant="outline"
              size="sm"
              sx={{ width: '100%' }}
              onClick={() => {
                clearSuggestions();
                setApplied(false);
                handleSuggest();
              }}
            >
              <Sparkles style={{ height: 14, width: 14, marginRight: 6 }} />
              Re-suggest
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
