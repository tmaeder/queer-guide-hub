import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useDebounce } from '@/hooks/useDebounce';
import {
  useProfessionFacets,
  type PersonalityFilters,
  type PersonalitySort,
} from '@/hooks/usePersonalities';

interface Props {
  filters: PersonalityFilters;
  onFiltersChange: (filters: PersonalityFilters) => void;
}

const SORT_OPTIONS: { value: PersonalitySort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'az', label: 'A\u2013Z' },
  { value: 'za', label: 'Z\u2013A' },
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
];

export function PersonalitiesFiltersBar({ filters, onFiltersChange }: Props) {
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 300);
  const { facets } = useProfessionFacets(12);

  // Push debounced search value up
  useEffect(() => {
    if ((debouncedSearch || '') !== (filters.search || '')) {
      onFiltersChange({ ...filters, search: debouncedSearch || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Keep local search in sync when parent clears
  useEffect(() => {
    if ((filters.search || '') !== searchInput) {
      setSearchInput(filters.search ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const professionChips = useMemo(
    () => facets.map((f) => f.profession),
    [facets],
  );

  const setProfession = (profession: string | null) => {
    onFiltersChange({ ...filters, profession: profession ?? undefined });
  };

  const setLiving = (living: boolean | null) => {
    onFiltersChange({ ...filters, is_living: living ?? undefined });
  };

  const setSort = (sortBy: PersonalitySort) => {
    onFiltersChange({ ...filters, sortBy });
  };

  const isAllActive =
    !filters.profession && filters.is_living === undefined && !filters.featured_only;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
      }}
    >
      {/* Row 1: search + sort */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search by name, profession, description..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ flex: '1 1 260px', bgcolor: 'background.default', borderRadius: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
            endAdornment: searchInput ? (
              <InputAdornment position="end">
                <Box
                  role="button"
                  aria-label="Clear search"
                  sx={{ cursor: 'pointer', display: 'flex' }}
                  onClick={() => setSearchInput('')}
                >
                  <X size={14} />
                </Box>
              </InputAdornment>
            ) : null,
          }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}>
            Sort
          </Typography>
          <Select value={filters.sortBy ?? 'featured'} onValueChange={(v) => setSort(v as PersonalitySort)}>
            <SelectTrigger style={{ width: 160 }} aria-label="Sort personalities">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setDrawerOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          aria-label="More filters"
        >
          <SlidersHorizontal size={16} />
          More
        </Button>
      </Box>

      {/* Row 2: profession chips */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          pb: 0.5,
          scrollSnapType: 'x mandatory',
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3 },
        }}
      >
        <Chip
          label="All"
          clickable
          color={isAllActive ? 'primary' : 'default'}
          variant={isAllActive ? 'filled' : 'outlined'}
          onClick={() =>
            onFiltersChange({
              ...filters,
              profession: undefined,
              is_living: undefined,
              featured_only: undefined,
            })
          }
          sx={{ scrollSnapAlign: 'start', flexShrink: 0 }}
        />
        <Chip
          label="Living"
          clickable
          color={filters.is_living === true ? 'primary' : 'default'}
          variant={filters.is_living === true ? 'filled' : 'outlined'}
          onClick={() => setLiving(filters.is_living === true ? null : true)}
          sx={{ scrollSnapAlign: 'start', flexShrink: 0 }}
        />
        <Chip
          label="Historical"
          clickable
          color={filters.is_living === false ? 'primary' : 'default'}
          variant={filters.is_living === false ? 'filled' : 'outlined'}
          onClick={() => setLiving(filters.is_living === false ? null : false)}
          sx={{ scrollSnapAlign: 'start', flexShrink: 0 }}
        />
        {professionChips.map((profession) => {
          const active = filters.profession === profession;
          return (
            <Chip
              key={profession}
              label={profession}
              clickable
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              onClick={() => setProfession(active ? null : profession)}
              sx={{ scrollSnapAlign: 'start', flexShrink: 0, textTransform: 'capitalize' }}
            />
          );
        })}
      </Box>

      {/* More filters drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>More filters</SheetTitle>
            <SheetDescription>Refine the personalities directory.</SheetDescription>
          </SheetHeader>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Verification status</Label>
              <Select
                value={filters.verification_status ?? 'all'}
                onValueChange={(v) =>
                  onFiltersChange({
                    ...filters,
                    verification_status: v === 'all' ? undefined : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="disputed">Disputed</SelectItem>
                </SelectContent>
              </Select>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Checkbox
                id="featured-only"
                checked={filters.featured_only === true}
                onCheckedChange={(checked) =>
                  onFiltersChange({
                    ...filters,
                    featured_only: checked === true ? true : undefined,
                  })
                }
              />
              <Label htmlFor="featured-only" sx={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                Featured only
              </Label>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Checkbox
                id="include-adult"
                checked={filters.exclude_adult === false}
                onCheckedChange={(checked) =>
                  onFiltersChange({
                    ...filters,
                    exclude_adult: checked === true ? false : true,
                  })
                }
              />
              <Box>
                <Label htmlFor="include-adult" sx={{ fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 }}>
                  Include adult performers
                </Label>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                  Hidden by default. Opt in to browse performers alongside other personalities.
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button
                variant="outline"
                style={{ flex: 1 }}
                onClick={() =>
                  onFiltersChange({
                    sortBy: filters.sortBy ?? 'featured',
                  })
                }
              >
                Reset filters
              </Button>
              <Button style={{ flex: 1 }} onClick={() => setDrawerOpen(false)}>
                Done
              </Button>
            </Box>
          </Box>
        </SheetContent>
      </Sheet>
    </Box>
  );
}
