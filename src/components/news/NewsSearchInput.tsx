import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Search, X, Newspaper } from 'lucide-react';
import { fetchAutocomplete, type SearchHit } from '@/lib/searchClient';

interface NewsSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function NewsSearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Search articles…',
  inputRef,
}: NewsSearchInputProps) {
  const navigate = useLocalizedNavigate();
  const [suggestions, setSuggestions] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      if (q.length < 2) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      try {
        const hits = await fetchAutocomplete(q, ['news'], 6);
        setSuggestions(hits);
        setOpen(hits.length > 0);
      } catch {
        /* best-effort */
      }
    }, q.length < 2 ? 0 : 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [value]);

  const handleSelect = useCallback(
    (hit: SearchHit) => {
      setOpen(false);
      setSuggestions([]);
      if (hit.slug) void navigate(`/news/${hit.slug as string}`);
    },
    [navigate],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative flex-1 md:max-w-md">
        <Search
          className="absolute text-muted-foreground"
          style={{
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 16,
            height: 16,
          }}
        />
        <PopoverAnchor asChild>
          <Input
            ref={inputRef}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ paddingLeft: 40, paddingRight: value ? 40 : 12 }}
            aria-label="Search articles"
            aria-expanded={open}
            aria-haspopup="listbox"
            autoComplete="off"
          />
        </PopoverAnchor>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange('');
              onClear?.();
              setOpen(false);
            }}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              height: 24,
              width: 24,
              padding: 0,
            }}
          >
            <X size={16} />
          </Button>
        )}
      </div>
      <PopoverContent
        align="start"
        style={{ padding: 0, width: 'var(--radix-popover-trigger-width)' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandList>
            <CommandEmpty className="py-4 text-sm text-center text-muted-foreground">
              No suggestions
            </CommandEmpty>
            <CommandGroup>
              {suggestions.map((hit) => (
                <CommandItem
                  key={String(hit.id || hit.objectID || hit.slug)}
                  value={String(hit.slug || hit.id || '')}
                  onSelect={() => handleSelect(hit)}
                  className="gap-2"
                >
                  <Newspaper size={14} className="shrink-0 text-muted-foreground" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-sm">{String(hit.title || '')}</span>
                    {hit.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {String(hit.description).slice(0, 70)}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
