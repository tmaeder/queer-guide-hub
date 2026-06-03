import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { searchUnifiedTagsByName } from '@/hooks/usePageFetchers';

interface TagHit {
  id: string;
  name: string;
  slug: string;
}

/**
 * Tag field backed by the `unified_tags` vocabulary. Value stays string[] of tag
 * names (compatible with the existing text[] columns), but suggestions are drawn
 * from unified_tags so contributors pick canonical tags instead of inventing
 * typo-variants. Free text is still allowed (Enter / comma) for genuinely new tags.
 * When the field declares relatedFields.tag_ids, the matched unified_tag ids are
 * mirrored there for downstream linking.
 */
export function UnifiedTagAutocompleteField({
  field,
  value,
  onChange,
  error,
  disabled,
  setFields,
}: FieldProps) {
  const tags = useMemo<string[]>(() => (Array.isArray(value) ? (value as string[]) : []), [value]);
  const [input, setInput] = useState('');
  const [hits, setHits] = useState<TagHit[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // name(lowercase) -> id, accumulated as the user picks/sees suggestions
  const idMapRef = useRef<Record<string, string>>({});

  const q = input.trim();

  useEffect(() => {
    const valid = !disabled && q.length >= 2;
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        if (!valid) {
          if (!cancelled) setHits([]);
          return;
        }
        const rows = await searchUnifiedTagsByName<TagHit>(q);
        if (cancelled) return;
        for (const r of rows) idMapRef.current[r.name.toLowerCase()] = r.id;
        setHits(rows.filter((r) => !tags.includes(r.name)));
      },
      valid ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, disabled, tags]);

  const syncIds = useCallback(
    (nextTags: string[]) => {
      const idField = field.relatedFields?.tag_ids;
      if (!idField || !setFields) return;
      const ids = nextTags.map((n) => idMapRef.current[n.toLowerCase()]).filter(Boolean);
      setFields({ [idField]: ids });
    },
    [field.relatedFields, setFields],
  );

  const commitTags = useCallback(
    (next: string[]) => {
      onChange(next);
      syncIds(next);
    },
    [onChange, syncIds],
  );

  const addTag = useCallback(
    (raw: string) => {
      if (disabled) return;
      const additions = raw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && !tags.includes(t));
      if (additions.length) commitTags([...tags, ...additions]);
      setInput('');
      setHits([]);
    },
    [tags, disabled, commitTags],
  );

  const removeTag = useCallback(
    (tag: string) => {
      if (disabled) return;
      commitTags(tags.filter((t) => t !== tag));
    },
    [tags, disabled, commitTags],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <FieldWrapper field={field} error={error}>
      <div className="relative">
        <div
          role="button"
          tabIndex={0}
          className={`rounded-element border border-input bg-muted/30 p-2 min-h-[42px] flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-ring ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'
          }`}
          onClick={() => inputRef.current?.focus()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.focus();
            }
          }}
        >
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 shrink-0">
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(tag);
                  }}
                  className="ml-0.5 hover:text-destructive focus:outline-none"
                  aria-label={`Remove tag "${tag}"`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
          {!disabled && (
            <input
              ref={inputRef}
              id={field.name}
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={handleKeyDown}
              placeholder={tags.length === 0 ? field.placeholder || 'Add tags…' : ''}
              className="flex-1 min-w-[100px] bg-transparent border-0 outline-none text-sm py-0.5 placeholder:text-muted-foreground"
              aria-label={field.label}
              aria-autocomplete="list"
            />
          )}
        </div>

        {open && !disabled && hits.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full m-0 p-0 list-none rounded-element border border-border bg-popover max-h-56 overflow-auto">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  // onMouseDown (not click) so it fires before the input blur
                  onMouseDown={(e) => {
                    e.preventDefault();
                    idMapRef.current[hit.name.toLowerCase()] = hit.id;
                    addTag(hit.name);
                  }}
                  className="w-full text-left px-2 py-2 text-sm hover:bg-muted"
                >
                  {hit.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!disabled && (
        <p className="text-xs text-muted-foreground mt-0.5">
          Pick from existing tags, or press Enter to add a new one.
        </p>
      )}
    </FieldWrapper>
  );
}
