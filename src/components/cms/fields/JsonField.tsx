import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';

/**
 * JSON editor field for the 'json' type.
 * Shows a textarea with formatted JSON (JSON.stringify with 2-space indent).
 * On blur, parses the JSON and calls onChange. Shows parse errors if invalid.
 */
export function JsonField({ field, value, onChange, error, disabled }: FieldProps) {
  const formatJson = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') {
      // Try to parse and re-format if it's a JSON string
      try {
        const parsed = JSON.parse(val);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return val;
      }
    }
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  };

  const [textValue, setTextValue] = useState(() => formatJson(value));
  const [parseError, setParseError] = useState<string | null>(null);
  const lastValueRef = useRef(value);

  // Sync text when value changes externally (not from our own edits)
  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      setTextValue(formatJson(value));
      setParseError(null);
    }
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTextValue(e.target.value);
      // Clear parse error while typing
      if (parseError) setParseError(null);
    },
    [parseError]
  );

  const handleBlur = useCallback(() => {
    const trimmed = textValue.trim();

    // Empty value
    if (trimmed === '') {
      setParseError(null);
      lastValueRef.current = null;
      onChange(null);
      return;
    }

    // Try to parse
    try {
      const parsed = JSON.parse(trimmed);
      setParseError(null);
      // Re-format the text
      const formatted = JSON.stringify(parsed, null, 2);
      setTextValue(formatted);
      lastValueRef.current = parsed;
      onChange(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid JSON';
      setParseError(message);
      // Don't call onChange with invalid JSON -- keep the previous valid value
    }
  }, [textValue, onChange]);

  // Format on Ctrl/Cmd+Shift+F
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        const trimmed = textValue.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed);
          setTextValue(JSON.stringify(parsed, null, 2));
          setParseError(null);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid JSON';
          setParseError(message);
        }
      }
      // Tab inserts 2 spaces
      if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = e.target as HTMLTextAreaElement;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = textValue.substring(0, start) + '  ' + textValue.substring(end);
        setTextValue(newValue);
        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [textValue]
  );

  const displayError = parseError || error;

  return (
    <FieldWrapper field={field} error={displayError ?? undefined}>
      <textarea
        id={field.name}
        value={textValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={field.placeholder || '{\n  "key": "value"\n}'}
        spellCheck={false}
        aria-invalid={!!displayError}
        className={`
          w-full min-h-[160px] px-3 py-2 rounded-lg text-sm font-mono
          bg-muted/50 border-0 resize-y
          focus:outline-none focus:ring-2 focus:ring-ring
          disabled:cursor-not-allowed disabled:opacity-50
          ${parseError ? 'ring-2 ring-red-400' : ''}
        `}
      />
      {!disabled && (
        <p className="text-2xs text-muted-foreground">
          Validates on blur. Ctrl+Shift+F to format.
        </p>
      )}
    </FieldWrapper>
  );
}
