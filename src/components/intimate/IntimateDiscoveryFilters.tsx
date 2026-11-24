import { forwardRef, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Check, ChevronDown, Search, X } from '@/components/icons';
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
import { HankyCodePicker } from '@/components/intimate/HankyCodePicker';

type Pocket = 'left' | 'right' | 'both';

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
  if (!bands.length || bands.length === AGE_BANDS.length) return 'Any age';
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
  /** Sought hanky colours, keyed by variant id → the pocket they wear it in. */
  hanky?: Record<string, Pocket>;
  onHankyChange?: (value: Record<string, Pocket>) => void;
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
  hanky = {},
  onHankyChange,
}: IntimateDiscoveryFiltersProps) {
  const hankyCount = Object.keys(hanky).length;
  const activeCount =
    roles.length + interests.length + bodies.length + hankyCount + (ages.length ? 1 : 0);
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
    onHankyChange?.({});
  };

  return (
    <section aria-label="Discovery filters" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterPopover label="Role" count={roles.length}>
          <InlineMultiSelect
            label="Role"
            values={ROLES}
            selected={roles}
            onChange={onRolesChange}
          />
        </FilterPopover>
        <FilterPopover
          label="Age"
          count={ages.length ? 1 : 0}
          summary={ages.length ? ageRangeLabel(ages) : undefined}
          wide
        >
          <AgeFilter selected={ages} onChange={onAgesChange} />
        </FilterPopover>
        <FilterPopover label="Body" count={bodies.length}>
          <InlineMultiSelect
            label="Body"
            values={BODY_TYPES}
            selected={bodies}
            onChange={onBodiesChange}
          />
        </FilterPopover>
        <InterestFilter
          options={interestOptions}
          loading={interestsLoading}
          selected={interests}
          onChange={onInterestsChange}
        />
        {onHankyChange && (
          <FilterPopover label="Hanky code" count={hankyCount} wide>
            <HankyCodePicker
              value={hanky}
              onChange={(variantId, side) => {
                const next = { ...hanky };
                if (side) next[variantId] = side;
                else delete next[variantId];
                onHankyChange(next);
              }}
              help="Show people who wear these colours. Left: they give or top. Right: they receive or bottom."
            />
          </FilterPopover>
        )}
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-9 px-2.5" onClick={clearAll}>
            Clear all
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

/** One filter as a button with its options in a popover, so the grid starts high. */
function FilterPopover({
  label,
  count,
  summary,
  wide = false,
  children,
}: {
  label: string;
  count: number;
  summary?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterTrigger label={label} count={count} summary={summary} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          'p-4',
          wide ? 'w-[min(32rem,calc(100vw-2rem))]' : 'w-[min(22rem,calc(100vw-2rem))]',
        )}
      >
        {children}
      </PopoverContent>
    </Popover>
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

function InlineMultiSelect({
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
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => {
          const checked = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => toggleValue(value)}
              className={cn(
                'min-h-8 shrink-0 rounded-element bg-surface-container px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                checked && 'bg-foreground text-background hover:bg-foreground/90',
              )}
              aria-pressed={checked}
            >
              {humanize(value)}
            </button>
          );
        })}
      </div>
    </div>
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
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const range = draft ?? ageRangeFromBands(selected);
  const draftBands = ageBandsFromRange(range);

  const commit = (value: number[]) => {
    const range: [number, number] = [value[0], value[1]];
    onChange(range[0] === 0 && range[1] === AGE_BANDS.length - 1 ? [] : ageBandsFromRange(range));
    setDraft(null);
  };

  return (
    <div role="group" aria-label="Age" className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">Age</span>
      <div className="flex min-w-0 items-center gap-4">
        <SliderPrimitive.Root
          className="relative flex h-8 min-w-36 flex-1 touch-none select-none items-center"
          min={0}
          max={AGE_BANDS.length - 1}
          step={1}
          value={range}
          onValueChange={(value) => setDraft([value[0], value[1]])}
          onValueCommit={commit}
          minStepsBetweenThumbs={0}
        >
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-dim">
            <SliderPrimitive.Range className="absolute h-full bg-foreground" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label="Minimum age band"
            aria-valuetext={AGE_BANDS[range[0]]}
            className="block h-5 w-5 rounded-full bg-foreground shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <SliderPrimitive.Thumb
            aria-label="Maximum age band"
            aria-valuetext={AGE_BANDS[range[1]]}
            className="block h-5 w-5 rounded-full bg-foreground shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </SliderPrimitive.Root>
        <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums">
          {ageRangeLabel(draftBands)}
        </span>
      </div>
      {selected.length ? (
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onChange([])}>
          Reset
        </Button>
      ) : null}
    </div>
  );
}
