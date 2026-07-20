import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import { roleLabel, toRoleSlug, useProfessionOptions } from '@/hooks/useProfessionOptions';

/**
 * Multi-value "roles" (Tätigkeit/Aktivität) field — the activity layer, kept
 * SEPARATE from the single free-text `profession` (Beruf). Value is string[] of
 * SLUGS from the shared `professions` vocabulary. The vocab is un-gated: any
 * term may be a role; the same term can be a profession for one person and a
 * role for another. Free text is accepted and slugified.
 */
export function RolesAutocompleteField({ field, value, onChange, error, disabled }: FieldProps) {
  const { options, loading } = useProfessionOptions();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo<string[]>(() => (Array.isArray(value) ? (value as string[]) : []), [value]);

  const add = (slug: string) => {
    const s = toRoleSlug(slug);
    if (!s || selected.includes(s)) return;
    onChange([...selected, s]);
    setSearch('');
  };
  const remove = (slug: string) => onChange(selected.filter((v) => v !== slug));

  const searchSlug = toRoleSlug(search);
  const showCreate =
    searchSlug &&
    !options.some((o) => o.slug === searchSlug) &&
    !selected.includes(searchSlug);

  return (
    <FieldWrapper field={field} error={error}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((slug) => (
            <Badge key={slug} variant="secondary" className="gap-1">
              {roleLabel(slug, options)}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(slug)}
                  aria-label={`Remove ${roleLabel(slug, options)}`}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  <X size={12} />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={field.name}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'h-10 w-full justify-between rounded-element border border-input bg-background px-4.5 py-2 font-normal text-muted-foreground',
            )}
          >
            <span className="truncate">{field.placeholder || 'Add an activity/role…'}</span>
            {loading ? (
              <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" aria-label="Loading" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search or type an activity…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No match — press Enter to add free text.</CommandEmpty>
              {showCreate && (
                <CommandGroup>
                  <CommandItem value={search} onSelect={() => add(search)}>
                    Add “{search.trim()}” ({searchSlug})
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup>
                {options
                  .filter((o) => !selected.includes(o.slug))
                  .map((o) => (
                    <CommandItem key={o.slug} value={`${o.name} ${o.slug}`} onSelect={() => add(o.slug)}>
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selected.includes(o.slug) ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {o.name}
                      {o.category && (
                        <span className="ml-auto text-xs text-muted-foreground">{o.category}</span>
                      )}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FieldWrapper>
  );
}
