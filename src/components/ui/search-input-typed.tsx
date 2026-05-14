import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import TextType from './TextType';

interface SearchInputTypedProps extends React.InputHTMLAttributes<HTMLInputElement> {
  placeholders: string[];
  typingSpeed?: number;
  pauseDuration?: number;
  showCursor?: boolean;
  cursorCharacter?: string;
  onValueChange?: (value: string) => void;
}

const SearchInputTyped = React.forwardRef<HTMLInputElement, SearchInputTypedProps>(
  (
    {
      placeholders = ['Search...'],
      typingSpeed = 50,
      pauseDuration = 2000,
      showCursor = true,
      cursorCharacter = '|',
      onValueChange,
      value,
      onChange,
      style: externalStyle,
      ...props
    },
    ref,
  ) => {
    const [inputValue, setInputValue] = useState(value || '');
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync internal state when external value prop changes
    useEffect(() => {
      setInputValue(value || '');
    }, [value]);

    useEffect(() => {
      if (ref) {
        if (typeof ref === 'function') {
          ref(inputRef.current);
        } else {
          ref.current = inputRef.current;
        }
      }
    }, [ref]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);
      onValueChange?.(newValue);
      onChange?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      props.onBlur?.(e);
    };

    // Show typed placeholder only when input is empty and not focused.
    // Drop falsy / empty entries — i18n bundles loading mid-render can
    // leave undefined slots in the array which would crash TextType.
    const safePlaceholders = placeholders.filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    const showTypedPlaceholder =
      !inputValue && !isFocused && safePlaceholders.length > 0;

    return (
      <div style={{ position: 'relative' }}>
        <Input
          ref={inputRef}
          style={{
            position: 'relative',
            zIndex: 10,
            background: 'transparent',
            ...externalStyle,
          }}
          value={inputValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={showTypedPlaceholder ? '' : props.placeholder || 'Search...'}
          {...props}
        />

        {showTypedPlaceholder && (
          <div
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              zIndex: 0,
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            <TextType
              text={safePlaceholders}
              typingSpeed={typingSpeed}
              pauseDuration={pauseDuration}
              showCursor={showCursor}
              cursorCharacter={cursorCharacter}
              loop={true}
              as="span"
              style={{ fontSize: '0.875rem' }}
            />
          </div>
        )}
      </div>
    );
  },
);

SearchInputTyped.displayName = 'SearchInputTyped';

export { SearchInputTyped };
