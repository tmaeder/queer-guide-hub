/**
 * AutoTagPanel — AI tag suggestion card for the CMS editor sidebar.
 *
 * Shows a "Suggest Tags" button that calls auto-tag-content in dry_run mode,
 * displays suggestions with confidence scores and checkboxes, then lets the
 * user apply selected tags.
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
          <div className="flex items-center gap-2">
            <Sparkles style={{ height: 16, width: 16 }} className="text-primary" />
            AI Tag Suggestions
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!suggestions && !loading && !applied && (
          <Button variant="outline" size="sm" onClick={handleSuggest}>
            <Sparkles style={{ height: 14, width: 14, marginRight: 6 }} />
            Suggest Tags
          </Button>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-2 py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-xs text-muted-foreground">Analyzing content…</span>
          </div>
        )}

        {tags.length > 0 && !applied && (
          <>
            <div className="flex flex-col gap-1">
              {tags.map((tag: TagSuggestion) => (
                <div
                  key={tag.name}
                  className="flex items-center gap-1 py-0.5 px-1 rounded hover:bg-muted"
                >
                  <Checkbox
                    id={`autotag-${tag.name}`}
                    checked={selected.has(tag.name)}
                    onCheckedChange={() => handleToggle(tag.name)}
                  />
                  <label htmlFor={`autotag-${tag.name}`} className="flex items-center gap-1 flex-wrap flex-1 m-0 cursor-pointer">
                    <span className="text-[0.8125rem]">{tag.name}</span>
                    <span
                      className="text-[0.6875rem] font-semibold leading-none"
                      style={{ color: confidenceColor(tag.confidence) }}
                    >
                      {confidenceLabel(tag.confidence)}
                    </span>
                    {tag.is_new && (
                      <Badge
                        variant="outline"
                        style={{ fontSize: '0.625rem', padding: '0 4px', lineHeight: '1.25rem' }}
                      >
                        NEW
                      </Badge>
                    )}
                  </label>
                </div>
              ))}
            </div>

            <div className="flex gap-1 mt-1">
              <Button size="sm" onClick={handleApply} disabled={applying || selected.size === 0}>
                {applying ? (
                  <Loader2 className="animate-spin" style={{ height: 14, width: 14, marginRight: 4 }} />
                ) : (
                  <Check style={{ height: 14, width: 14, marginRight: 4 }} />
                )}
                Apply {selected.size > 0 ? `(${selected.size})` : ''}
              </Button>
              <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={applying}>
                All
              </Button>
            </div>
          </>
        )}

        {suggestions && tags.length === 0 && !loading && (
          <div className="flex items-center gap-2 py-2">
            <AlertCircle style={{ height: 14, width: 14 }} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">No tags suggested for this item</span>
          </div>
        )}

        {applied && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 py-2">
              <Check style={{ height: 14, width: 14, color: '#16a34a' }} />
              <span className="text-xs font-medium" style={{ color: '#16a34a' }}>
                Tags applied successfully
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearSuggestions();
                setApplied(false);
                handleSuggest();
              }}
            >
              <Sparkles style={{ height: 14, width: 14, marginRight: 6 }} />
              Re-suggest
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
