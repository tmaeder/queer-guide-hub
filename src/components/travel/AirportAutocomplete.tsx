import { useState, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Plane } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { fetchAirportByIata, searchAirports, type AirportRow } from '@/hooks/useAirportSearch';

interface AirportAutocompleteProps {
  value: string;
  displayLabel?: string;
  onChange: (iata: string, label: string) => void;
  placeholder?: string;
  label?: string;
}

function rankAirports(data: AirportRow[], q: string) {
  return [...data]
    .sort((a, b) => {
      const aName = a.name?.toLowerCase() || '';
      const bName = b.name?.toLowerCase() || '';
      const aCityMatch = a.city_name?.toLowerCase() === q.toLowerCase();
      const bCityMatch = b.city_name?.toLowerCase() === q.toLowerCase();
      const aIataMatch = a.iata_code?.toLowerCase() === q.toLowerCase();
      const bIataMatch = b.iata_code?.toLowerCase() === q.toLowerCase();
      const aIsCommercial = /airport|international|aeroport|aeropuerto|flughafen/i.test(aName);
      const bIsCommercial = /airport|international|aeroport|aeropuerto|flughafen/i.test(bName);

      // Exact IATA match first
      if (aIataMatch && !bIataMatch) return -1;
      if (bIataMatch && !aIataMatch) return 1;
      // Then commercial airports with exact city match
      if (aCityMatch && aIsCommercial && !(bCityMatch && bIsCommercial)) return -1;
      if (bCityMatch && bIsCommercial && !(aCityMatch && aIsCommercial)) return 1;
      // Then any commercial airport
      if (aIsCommercial && !bIsCommercial) return -1;
      if (bIsCommercial && !aIsCommercial) return 1;
      // Then exact city match
      if (aCityMatch && !bCityMatch) return -1;
      if (bCityMatch && !aCityMatch) return 1;
      // Alphabetical by name
      return aName.localeCompare(bName);
    })
    .slice(0, 12);
}

export function AirportAutocomplete({
  value,
  displayLabel,
  onChange,
  placeholder = 'Search airports...',
  label,
}: AirportAutocompleteProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const listId = `${inputId}-airports`;
  const statusId = `${inputId}-status`;
  const [displayValue, setDisplayValue] = useState(displayLabel || value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [response, setResponse] = useState<{
    query: string;
    airports: AirportRow[];
    failed: boolean;
  }>({ query: '', airports: [], failed: false });
  const results = response.query === query ? response.airports : [];
  const loading = query.trim().length >= 2 && !value && response.query !== query;
  const showOptions = open && results.length > 0;

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    // Synchronize a selected airport supplied by a restored URL or swapped route.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync an externally selected airport, never the typed query
    setDisplayValue(displayLabel || value);
    if (!displayLabel) {
      void fetchAirportByIata(value)
        .then((airport) => {
          if (!cancelled && airport)
            setDisplayValue(`${airport.city_name || value} (${airport.iata_code})`);
        })
        .catch(() => {
          /* The selected IATA code remains a usable fallback label. */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [value, displayLabel]);

  useEffect(() => {
    if (query.trim().length < 2 || value) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchAirports(query.trim(), controller.signal)
        .then((airports) => {
          if (!cancelled)
            setResponse({ query, airports: rankAirports(airports, query.trim()), failed: false });
        })
        .catch(() => {
          if (!cancelled) setResponse({ query, airports: [], failed: true });
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, value]);

  useEffect(() => {
    if (showOptions && activeIndex >= 0)
      document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId, showOptions]);

  const select = (airport: AirportRow) => {
    const nextLabel = `${airport.city_name || airport.name} (${airport.iata_code})`;
    setDisplayValue(nextLabel);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    onChange(airport.iata_code, nextLabel);
  };
  const pending = !!displayValue.trim() && !value;
  const status = loading
    ? t('pages.travel.airports.loading', 'Searching airports…')
    : response.query === query && response.failed
      ? t(
          'pages.travel.airports.error',
          'Airports could not be loaded. Edit your search to try again.',
        )
      : query.trim().length >= 2 && !value && results.length === 0
        ? t('pages.travel.airports.empty', 'No airports found. Try a city or airport code.')
        : pending
          ? t('pages.travel.airports.choose', 'Choose an airport from the suggestions.')
          : '';

  return (
    <div className="relative">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium mb-1 block">
          {label}
        </label>
      )}
      <Input
        id={inputId}
        value={displayValue}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-label={label || t('pages.travel.airports.label', 'Airport')}
        aria-expanded={showOptions}
        aria-controls={showOptions ? listId : undefined}
        aria-activedescendant={
          showOptions && !!results[activeIndex] ? `${listId}-${activeIndex}` : undefined
        }
        aria-describedby={status ? statusId : undefined}
        aria-invalid={pending}
        autoComplete="off"
        onChange={(event) => {
          const text = event.target.value;
          setDisplayValue(text);
          setQuery(text);
          setOpen(true);
          setActiveIndex(-1);
          onChange('', text);
        }}
        onBlur={() => {
          setOpen(false);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) =>
              event.key === 'ArrowDown'
                ? (index + 1) % results.length
                : index < 0
                  ? results.length - 1
                  : (index - 1 + results.length) % results.length,
            );
          } else if (event.key === 'Enter' && showOptions && !!results[activeIndex]) {
            event.preventDefault();
            select(results[activeIndex]);
          } else if (event.key === 'Enter' && pending) {
            event.preventDefault();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
      />
      {showOptions && (
        <div
          id={listId}
          role="listbox"
          aria-label={t('pages.travel.airports.results', 'Airports')}
          className="absolute top-full left-0 right-0 z-50 bg-surface-container max-h-80 overflow-auto mt-1 rounded-element"
        >
          {results.map((airport, index) => (
            <button
              type="button"
              tabIndex={-1}
              key={airport.iata_code}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(airport)}
              className={`w-full text-left px-4 py-2 cursor-pointer flex items-center gap-2 hover:bg-muted ${index === activeIndex ? 'bg-muted' : ''}`}
            >
              <Plane size={14} aria-hidden className="shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {airport.city_name || airport.name} ({airport.iata_code})
                </p>
                <p className="text-xs text-muted-foreground">
                  {airport.name}
                  {airport.country_code ? ` · ${airport.country_code}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      <p
        id={statusId}
        role="status"
        className={status && open ? 'mt-1 text-xs text-muted-foreground' : 'sr-only'}
      >
        {status}
      </p>
    </div>
  );
}
