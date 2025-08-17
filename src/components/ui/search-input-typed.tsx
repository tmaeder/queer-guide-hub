import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import TextType from "./TextType";
import { cn } from "@/lib/utils";

interface SearchInputTypedProps extends React.InputHTMLAttributes<HTMLInputElement> {
  placeholders: string[];
  typingSpeed?: number;
  pauseDuration?: number;
  showCursor?: boolean;
  cursorCharacter?: string;
  onValueChange?: (value: string) => void;
}

const SearchInputTyped = React.forwardRef<HTMLInputElement, SearchInputTypedProps>(
  ({
    className,
    placeholders = ["Search..."],
    typingSpeed = 50,
    pauseDuration = 2000,
    showCursor = true,
    cursorCharacter = "|",
    onValueChange,
    value,
    onChange,
    ...props
  }, ref) => {
    const [inputValue, setInputValue] = useState(value || "");
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

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

    // Show typed placeholder only when input is empty and not focused
    const showTypedPlaceholder = !inputValue && !isFocused;

    return (
      <div className="relative">
        <Input
          ref={inputRef}
          className={cn(
            "relative z-10 bg-transparent",
            showTypedPlaceholder && "placeholder:text-transparent",
            className
          )}
          value={inputValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={showTypedPlaceholder ? "" : props.placeholder || "Search..."}
          {...props}
        />
        
        {showTypedPlaceholder && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-0 text-muted-foreground">
            <TextType
              text={placeholders}
              typingSpeed={typingSpeed}
              pauseDuration={pauseDuration}
              showCursor={showCursor}
              cursorCharacter={cursorCharacter}
              loop={true}
              as="span"
              className="text-sm"
            />
          </div>
        )}
      </div>
    );
  }
);

SearchInputTyped.displayName = "SearchInputTyped";

export { SearchInputTyped };