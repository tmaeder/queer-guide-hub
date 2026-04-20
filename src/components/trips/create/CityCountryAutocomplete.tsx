import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Popper from '@mui/material/Popper';
import Paper from '@mui/material/Paper';
import { MapPin, Loader2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';

export interface GeoSelection {
  cityId: string;
  cityName: string;
  countryId: string;
  countryName: string;
  countryCode: string | null;
  timezone: string | null;
}

interface Option {
  cityId: string;
  cityName: string;
  countryId: string;
  countryName: string;
  countryCode: string | null;
  timezone: string | null;
}

interface Props {
  value: GeoSelection | null;
  onChange: (selection: GeoSelection | null) => void;
  onFallbackRequested?: (query: string) => void;
  label?: string;
  required?: boolean;
  autoFocus?: boolean;
  id?: string;
}

const normalize = (s: string) => s.normalize('NFC').trim();

/**
 * City + Country autocomplete backed by the `search_cities` RPC
 * (PostgreSQL `unaccent` → diacritic-insensitive prefix/substring match).
 * Returns a fully-resolved GeoSelection so callers can persist structured
 * geo data — never free text.
 */
export function CityCountryAutocomplete({
  value,
  onChange,
  onFallbackRequested,
  label,
  required,
  autoFocus,
  id = 'trip-city-country',
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(
    value ? `${value.cityName}, ${value.countryName}` : '',
  );
  const debounced = useDebounce(query, 300);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [composing, setComposing] = useState(false);
  const [anchorReady, setAnchorReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastSyncedCityId = useRef<string | null>(null);

  // Popper needs a non-null anchorEl on first open — force a re-render
  // after mount so anchorEl is populated before open flips to true.
  useLayoutEffect(() => {
    setAnchorReady(true);
  }, []);

  // Sync external value → input text, but only when the city id actually
  // changes. Prevents the value-effect clobbering user typing.
  useEffect(() => {
    if (!value) return;
    if (lastSyncedCityId.current === value.cityId) return;
    lastSyncedCityId.current = value.cityId;
    setQuery(`${value.cityName}, ${value.countryName}`);
  }, [value]);

  // Close on outside mousedown — no blur-timer race.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const search = useCallback(async (q: string) => {
    const trimmed = normalize(q);
    if (trimmed.length < 2) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('search_cities', {
        q: trimmed,
        max_results: 8,
      });
      if (error) throw error;
      const mapped: Option[] = (data ?? []).map(
        (row: Record<string, unknown>) => ({
          cityId: row.id as string,
          cityName: row.name as string,
          countryId: row.country_id as string,
          countryName: row.country_name as string,
          countryCode: (row.country_code as string | null) ?? null,
          timezone: (row.timezone as string | null) ?? null,
        }),
      );
      setOptions(mapped);
    } catch (err) {
      console.error('[CityCountryAutocomplete] search failed', err);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (composing) return;
    if (value && `${value.cityName}, ${value.countryName}` === query) return;
    search(debounced);
  }, [debounced, search, value, query, composing]);

  const handleSelect = (opt: Option) => {
    const selection: GeoSelection = {
      cityId: opt.cityId,
      cityName: opt.cityName,
      countryId: opt.countryId,
      countryName: opt.countryName,
      countryCode: opt.countryCode,
      timezone: opt.timezone,
    };
    lastSyncedCityId.current = opt.cityId;
    onChange(selection);
    setQuery(`${opt.cityName}, ${opt.countryName}`);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || options.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(options[highlight]);
    }
  };

  const normalizedQueryLen = normalize(debounced).length;

  return (
    <Box ref={rootRef} sx={{ position: 'relative' }}>
      <TextField
        id={id}
        fullWidth
        label={label ?? t('trips.dialog.create.cityCountryLabel')}
        required={required}
        autoFocus={autoFocus}
        placeholder={t('trips.dialog.create.cityCountryPlaceholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (value) {
            lastSyncedCityId.current = null;
            onChange(null);
          }
        }}
        onFocus={() => setOpen(true)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(e) => {
          setComposing(false);
          setQuery((e.target as HTMLInputElement).value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        InputProps={{
          startAdornment: (
            <Box sx={{ mr: 1, color: 'text.secondary', display: 'flex' }}>
              <MapPin size={16} />
            </Box>
          ),
          endAdornment: loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : value ? (
            <Check size={16} style={{ color: '#10B981' }} />
          ) : null,
        }}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
      />

      <Popper
        open={
          anchorReady &&
          open &&
          (options.length > 0 || (!loading && normalizedQueryLen >= 2))
        }
        anchorEl={rootRef.current}
        placement="bottom-start"
        style={{ zIndex: 1500, width: rootRef.current?.clientWidth }}
      >
        <Paper
          id={`${id}-listbox`}
          role="listbox"
          elevation={6}
          sx={{ mt: 0.5, maxHeight: 320, overflowY: 'auto' }}
        >
          {options.length === 0 && !loading && (
            <Box sx={{ p: 2 }}>
              <Box sx={{ fontSize: 13, color: 'text.secondary', mb: 1 }}>
                {t('trips.dialog.create.noCityMatch')}
              </Box>
              {onFallbackRequested && (
                <Box
                  component="button"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onFallbackRequested(normalize(debounced));
                    setOpen(false);
                  }}
                  sx={{
                    border: 0,
                    background: 'transparent',
                    color: 'brand.main',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    p: 0,
                  }}
                >
                  {t('trips.dialog.create.addNewPlace', {
                    query: normalize(debounced),
                  })}
                </Box>
              )}
            </Box>
          )}
          {options.map((opt, i) => (
            <Box
              key={opt.cityId}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(opt);
              }}
              onMouseEnter={() => setHighlight(i)}
              sx={{
                px: 2,
                py: 1.25,
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                cursor: 'pointer',
                bgcolor: i === highlight ? 'action.hover' : 'transparent',
              }}
            >
              <Box
                component="span"
                sx={{
                  fontSize: 18,
                  lineHeight: 1,
                  minWidth: 22,
                  textAlign: 'center',
                }}
                aria-hidden
              >
                {flagEmoji(opt.countryCode)}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: 14, fontWeight: 600 }}>{opt.cityName}</Box>
                <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {opt.countryName}
                </Box>
              </Box>
            </Box>
          ))}
        </Paper>
      </Popper>
    </Box>
  );
}

/** Emoji flag from ISO-3166 alpha-2 country code, e.g. "DE" → 🇩🇪 */
function flagEmoji(code: string | null): string {
  if (!code || code.length !== 2) return '🌍';
  const A = 0x1f1e6;
  const base = 'A'.charCodeAt(0);
  return String.fromCodePoint(
    A + code.toUpperCase().charCodeAt(0) - base,
    A + code.toUpperCase().charCodeAt(1) - base,
  );
}
