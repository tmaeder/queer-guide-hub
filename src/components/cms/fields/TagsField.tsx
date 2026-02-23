import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { X } from 'lucide-react';

/**
 * Tags input field for the 'tags' type.
 * Value is string[]. Shows tags as Badge chips with an (X) remove button.
 * Text input to add new tags separated by comma or Enter.
 */
export function TagsField({ field, value, onChange, error, disabled }: FieldProps) {
  const tags = useMemo<string[]>(() => {
    if (Array.isArray(value)) return value as string[];
    return [];
  }, [value]);

  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTags = useCallback(
    (raw: string) => {
      if (disabled) return;
      const newTags = raw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && !tags.includes(t));

      if (newTags.length > 0) {
        onChange([...tags, ...newTags]);
      }
      setInputValue('');
    },
    [tags, onChange, disabled]
  );

  const removeTag = useCallback(
    (tag: string) => {
      if (disabled) return;
      onChange(tags.filter((t) => t !== tag));
    },
    [tags, onChange, disabled]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addTags(inputValue);
      }
    }
    // Backspace on empty input removes last tag
    if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      addTags(inputValue);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes(',')) {
      e.preventDefault();
      addTags(pasted);
    }
  };

  return (
    <FieldWrapper field={field} error={error}>
      <div
        className={`
          rounded-lg border border-input bg-muted/30 p-2 min-h-[42px]
          flex flex-wrap items-center gap-1.5
          focus-within:ring-2 focus-within:ring-ring
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'}
        `}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Tag badges */}
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="gap-1 shrink-0"
          >
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

        {/* Input */}
        {!disabled && (
          <input
            ref={inputRef}
            id={field.name}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onPaste={handlePaste}
            placeholder={tags.length === 0 ? (field.placeholder || 'Add tags...') : ''}
            className="flex-1 min-w-[100px] bg-transparent border-0 outline-none text-sm py-0.5 placeholder:text-muted-foreground"
          />
        )}
      </div>

      {!disabled && (
        <p className="text-xs text-muted-foreground mt-0.5">
          Press Enter or comma to add a tag
        </p>
      )}
    </FieldWrapper>
  );
}
