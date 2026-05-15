import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { MapPin, Loader2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const rootRef = useRef<HTMLDivElement>(null);
  const lastSyncedCityId = useRef<string | null>(null);

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
  const showDropdown = open && (options.length > 0 || (!loading && normalizedQueryLen >= 2));

  return (
    <div ref={rootRef} className="relative">
      <Label htmlFor={id}>
        {label ?? t('trips.dialog.create.cityCountryLabel')}
        {required && ' *'}
      </Label>
      <div className="relative mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground flex">
          <MapPin size={16} />
        </span>
        <Input
          id={id}
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
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          className="pl-9 pr-9"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 flex">
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : value ? (
            <Check size={16} style={{ color: '#10B981' }} />
          ) : null}
        </span>
      </div>

      {showDropdown && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className="absolute left-0 right-0 mt-1 max-h-80 overflow-y-auto bg-background border border-border rounded-element shadow-lg"
          style={{ zIndex: 1500 }}
        >
          {options.length === 0 && !loading && (
            <div className="p-4">
              <div className="text-[13px] text-muted-foreground mb-2">
                {t('trips.dialog.create.noCityMatch')}
              </div>
              {onFallbackRequested && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onFallbackRequested(normalize(debounced));
                    setOpen(false);
                  }}
                  className="border-0 bg-transparent font-semibold text-[13px] cursor-pointer p-0"
                  style={{ color: 'hsl(var(--foreground))' }}
                >
                  {t('trips.dialog.create.addNewPlace', {
                    query: normalize(debounced),
                  })}
                </button>
              )}
            </div>
          )}
          {options.map((opt, i) => (
            <div
              key={opt.cityId}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(opt);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`px-4 py-2.5 flex items-center gap-2.5 cursor-pointer ${i === highlight ? 'bg-muted' : ''}`}
            >
              <span
                className="text-lg leading-none min-w-[22px] text-center"
                aria-hidden
              >
                {flagEmoji(opt.countryCode)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{opt.cityName}</div>
                <div className="text-xs text-muted-foreground">
                  {opt.countryName}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
