import { forwardRef, useMemo, useState, type ButtonHTMLAttributes } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Link } from 'react-router';
import { AGE_BANDS, BODY_TYPES, ROLES } from '@/assets/intimate/options';
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
import { ageBandsFromRange, type InterestOption } from '@/lib/intimate/discoveryFilters';
import { cn } from '@/lib/utils';

function ageRangeFromBands(bands: string[]): [number, number] {
  if (!bands.length) return [0, AGE_BANDS.length - 1];
  const indices = bands
    .map((band) => AGE_BANDS.indexOf(band as (typeof AGE_BANDS)[number]))
    .filter((index) => index >= 0);
  if (!indices.length) return [0, AGE_BANDS.length - 1];
  return [Math.min(...indices), Math.max(...indices)];
}

function humanize(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ageRangeLabel(bands: string[]) {
  if (!bands.length) return 'Any age';
  if (bands.length === 1) return bands[0];
  const first = bands[0].split('-')[0];
  const last = bands[bands.length - 1].split('-').at(-1);
  return `${first}–${last}`;
}

interface IntimateDiscoveryFiltersProps {
  roles: string[];
  onRolesChange: (values: string[]) => void;
  interestOptions: InterestOption[];
  interestsLoading?: boolean;
  interests: string[];
  onInterestsChange: (values: string[]) => void;
  ages: string[];
  onAgesChange: (values: string[]) => void;
  bodies: string[];
  onBodiesChange: (values: string[]) => void;
}

export function IntimateDiscoveryFilters({
  roles,
  onRolesChange,
  interestOptions,
  interestsLoading = false,
  interests,
  onInterestsChange,
  ages,
  onAgesChange,
  bodies,
  onBodiesChange,
}: IntimateDiscoveryFiltersProps) {
  const activeCount = roles.length + interests.length + bodies.length + (ages.length ? 1 : 0);
  const interestById = useMemo(
    () => new Map(interestOptions.map((option) => [option.id, option])),
    [interestOptions],
  );
  const chips = [
    ...roles.map((value) => ({
      key: `role:${value}`,
      label: humanize(value),
      remove: () => onRolesChange(roles.filter((role) => role !== value)),
    })),
    ...interests.map((value) => ({
      key: `into:${value}`,
      label: interestById.get(value)?.label ?? humanize(value),
      remove: () => onInterestsChange(interests.filter((interest) => interest !== value)),
    })),
    ...(ages.length
      ? [{ key: 'age', label: ageRangeLabel(ages), remove: () => onAgesChange([]) }]
      : []),
    ...bodies.map((value) => ({
      key: `body:${value}`,
      label: humanize(value),
      remove: () => onBodiesChange(bodies.filter((body) => body !== value)),
    })),
  ];

  const clearAll = () => {
    onRolesChange([]);
    onInterestsChange([]);
    onAgesChange([]);
    onBodiesChange([]);
  };

  return (
    <section aria-label="Discovery filters" className="mb-6 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-13 font-medium text-muted-foreground">
          Filters{activeCount ? ` · ${activeCount}` : ''}
        </span>
        <MultiSelectFilter label="Role" values={ROLES} selected={roles} onChange={onRolesChange} />
        <InterestFilter
          options={interestOptions}
          loading={interestsLoading}
          selected={interests}
          onChange={onInterestsChange}
        />
        <AgeFilter selected={ages} onChange={onAgesChange} />
        <MultiSelectFilter
          label="Body"
          values={BODY_TYPES}
          selected={bodies}
          onChange={onBodiesChange}
        />
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-9 px-2.5" onClick={clearAll}>
            Clear
          </Button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Active filters">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.remove}
              className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-element bg-surface-container px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove ${chip.label} filter`}
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

interface FilterTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  count: number;
  summary?: string;
}

const FilterTrigger = forwardRef<HTMLButtonElement, FilterTriggerProps>(function FilterTrigger(
  { label, count, summary, className, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      className={cn(
        'h-9 gap-1.5 bg-surface-container px-2.5 font-medium hover:bg-surface-container-high',
        count > 0 && 'bg-foreground text-background hover:bg-foreground/90 hover:text-background',
        className,
      )}
      {...props}
    >
      <span>{summary ?? label}</span>
      {count > 0 && !summary && <span className="tabular-nums">{count}</span>}
      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
    </Button>
  );
});

function MultiSelectFilter({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: readonly string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const toggleValue = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((selectedValue) => selectedValue !== value)
        : [...selected, value],
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterTrigger label={label} count={selected.length} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <div className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">{label}</div>
        <div className="space-y-0.5">
          {values.map((value) => {
            const checked = selected.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleValue(value)}
                className="flex min-h-10 w-full items-center gap-2 rounded-element px-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-pressed={checked}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-badge bg-surface-dim',
                    checked && 'bg-foreground text-background',
                  )}
                  aria-hidden
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span>{humanize(value)}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InterestFilter({
  options,
  loading,
  selected,
  onChange,
}: {
  options: InterestOption[];
  loading: boolean;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const groups = useMemo(() => {
    const grouped = new Map<string, { label: string; options: InterestOption[] }>();
    for (const option of options) {
      const group = grouped.get(option.categoryId) ?? {
        label: option.categoryLabel,
        options: [],
      };
      group.options.push(option);
      grouped.set(option.categoryId, group);
    }
    return [...grouped.values()];
  }, [options]);

  const toggleValue = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((selectedValue) => selectedValue !== value)
        : [...selected, value],
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterTrigger label="Into" count={selected.length} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] overflow-hidden p-0">
        <Command label="Search interests">
          <CommandInput placeholder="Search interests and kinks…" aria-label="Search interests" />
          <CommandList style={{ maxHeight: 'min(24rem, 55vh)' }} aria-multiselectable="true">
            <CommandEmpty>{loading ? 'Loading interests…' : 'No interests found.'}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.options.map((option) => {
                  const checked = selected.includes(option.id);
                  return (
                    <CommandItem
                      key={option.id}
                      value={`${option.label} ${group.label}`}
                      onSelect={() => toggleValue(option.id)}
                      aria-label={`${option.label}${checked ? ', selected' : ''}`}
                      className="min-h-10 gap-2"
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-badge bg-surface-dim',
                          checked && 'bg-foreground text-background',
                        )}
                        aria-hidden
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span>{option.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container px-4 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" aria-hidden />
            Only interests people chose to share can match.
          </span>
          <Link to="/tools/checklist" className="shrink-0 font-medium text-foreground underline">
            My checklist
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AgeFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<[number, number]>(() => ageRangeFromBands(selected));
  const selectedLabel = ageRangeLabel(selected);
  const draftBands = ageBandsFromRange(draft);

  const handleOpen = (nextOpen: boolean) => {
    if (nextOpen) setDraft(ageRangeFromBands(selected));
    setOpen(nextOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <FilterTrigger
          label="Age"
          count={selected.length ? 1 : 0}
          summary={selected.length ? selectedLabel : undefined}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-4">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <span className="text-xs font-medium text-muted-foreground">Age range</span>
          <span className="text-sm font-medium tabular-nums">{ageRangeLabel(draftBands)}</span>
        </div>
        <SliderPrimitive.Root
          className="relative flex h-6 w-full touch-none select-none items-center"
          min={0}
          max={AGE_BANDS.length - 1}
          step={1}
          value={draft}
          onValueChange={(value) => setDraft([value[0], value[1]])}
          minStepsBetweenThumbs={0}
        >
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-dim">
            <SliderPrimitive.Range className="absolute h-full bg-foreground" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label="Minimum age band"
            aria-valuetext={AGE_BANDS[draft[0]]}
            className="block h-5 w-5 rounded-full bg-foreground shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <SliderPrimitive.Thumb
            aria-label="Maximum age band"
            aria-valuetext={AGE_BANDS[draft[1]]}
            className="block h-5 w-5 rounded-full bg-foreground shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </SliderPrimitive.Root>
        <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>18</span>
          <span>70+</span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
          >
            Any age
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onChange(draft[0] === 0 && draft[1] === AGE_BANDS.length - 1 ? [] : draftBands);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
