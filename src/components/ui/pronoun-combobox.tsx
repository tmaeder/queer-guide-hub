import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export const PRONOUN_SUGGESTIONS = [
  'she/her',
  'he/him',
  'they/them',
  'ze/zir',
  'ze/hir',
  'xe/xem',
  'it/its',
  'fae/faer',
  'any pronouns',
  'ask me',
];

export const MAX_PRONOUN_SETS = 3;
const MAX_FREE_TEXT_LEN = 30;

/**
 * Display rule: multiple known sets join by first segment ("she/her" +
 * "they/them" → "she/they"); a single set renders in full; free text
 * renders verbatim.
 */
export function pronounDisplay(tags: string[]): string {
  const cleaned = tags.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0];
  const firsts = cleaned.map((t) => {
    const slash = t.indexOf('/');
    return slash > 0 ? t.slice(0, slash) : t;
  });
  return firsts.join('/');
}

interface PronounComboboxProps {
  value: string[];
  onValueChange: (tags: string[]) => void;
  id?: string;
  disabled?: boolean;
}

/**
 * Ordered multi-select: curated suggestions + free text. Selection order is
 * preserved (it drives the display string); remove + re-add to reorder.
 */
export function PronounCombobox({ value, onValueChange, id, disabled }: PronounComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const atLimit = value.length >= MAX_PRONOUN_SETS;
  const trimmed = search.trim();
  const tooLong = trimmed.length > MAX_FREE_TEXT_LEN;
  const showCreate =
    trimmed.length > 0 &&
    !tooLong &&
    !atLimit &&
    !PRONOUN_SUGGESTIONS.some((p) => p.toLowerCase() === trimmed.toLowerCase()) &&
    !value.some((p) => p.toLowerCase() === trimmed.toLowerCase());

  const toggle = (tag: string) => {
    if (value.includes(tag)) {
      onValueChange(value.filter((t) => t !== tag));
    } else if (!atLimit) {
      onValueChange([...value, tag]);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'h-10 w-full justify-between rounded-element border border-input bg-background px-4 py-2 font-normal transition-all hover:border-foreground/40 hover:bg-background',
              value.length === 0 && 'text-muted-foreground',
            )}
          >
            <span className="truncate">
              {value.length > 0 ? pronounDisplay(value) : 'Add pronouns'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search or type your own…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {tooLong ? `Keep it under ${MAX_FREE_TEXT_LEN} characters.` : 'No match.'}
              </CommandEmpty>
              <CommandGroup>
                {PRONOUN_SUGGESTIONS.map((p) => {
                  const selected = value.includes(p);
                  return (
                    <CommandItem
                      key={p}
                      value={p}
                      disabled={!selected && atLimit}
                      onSelect={() => toggle(p)}
                    >
                      <Check
                        className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')}
                      />
                      {p}
                    </CommandItem>
                  );
                })}
                {showCreate && (
                  <CommandItem
                    value={trimmed}
                    onSelect={() => {
                      onValueChange([...value, trimmed]);
                      setSearch('');
                    }}
                  >
                    <Check className="mr-2 h-4 w-4 opacity-0" />
                    Use "{trimmed}"
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Selected pronouns, in display order">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="rounded-badge gap-1 pr-1">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                className="rounded-badge p-0.5 hover:bg-accent"
                onClick={() => onValueChange(value.filter((t) => t !== tag))}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {atLimit && (
        <p className="text-xs text-muted-foreground">Up to {MAX_PRONOUN_SETS} sets.</p>
      )}
    </div>
  );
}
