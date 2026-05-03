import { useState, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Plane } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fetchAirportByIata, searchAirports } from '@/hooks/useAirportSearch';

interface Airport {
  iata_code: string;
  name: string;
  city_name: string | null;
  country_code: string | null;
}

interface AirportAutocompleteProps {
  value: string;
  displayLabel?: string;
  onChange: (iata: string, label: string) => void;
  placeholder?: string;
  label?: string;
}

export function AirportAutocomplete({
  value,
  displayLabel,
  onChange,
  placeholder = 'Search airports...',
  label,
}: AirportAutocompleteProps) {
  const [_query, setQuery] = useState('');
  const [displayValue, setDisplayValue] = useState(displayLabel || '');
  const [results, setResults] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync display value when displayLabel or value changes from parent
  useEffect(() => {
    if (displayLabel) {
      setDisplayValue(displayLabel);
    } else if (value && !displayValue) {
      // Fallback: resolve IATA code to display label from DB
      const loadLabel = async () => {
        const data = await fetchAirportByIata(value);
        if (data) {
          setDisplayValue(`${data.city_name || value} (${data.iata_code})`);
        } else {
          setDisplayValue(value);
        }
      };
      loadLabel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- displayValue excluded to avoid infinite loop (effect sets it)
  }, [value, displayLabel]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const search = async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);

    // Exact IATA match gets priority (e.g. "LHR")

    const data = await searchAirports(q);

    // Sort results by relevance: major airports first, then exact city match, then alphabetical
    const sorted = data.sort((a, b) => {
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
    });

    setResults(sorted.slice(0, 12));
    setLoading(false);
  };

  const handleInputChange = (val: string) => {
    setDisplayValue(val);
    setQuery(val);
    setOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 200);
  };

  const handleSelect = (airport: Airport) => {
    const label = `${airport.city_name || airport.name} (${airport.iata_code})`;
    setDisplayValue(label);
    onChange(airport.iata_code, label);
    setOpen(false);
  };

  return (
    <Box ref={containerRef} sx={{ position: 'relative' }}>
      {label && (
        <Typography component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 0.5, display: 'block' }}>
          {label}
        </Typography>
      )}
      <Input
        value={displayValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder={placeholder}
      />
      {open && results.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            bgcolor: 'background.paper',
            maxHeight: 320,
            overflow: 'auto',
            mt: 0.5,
          }}
        >
          {results.map((airport) => (
            <Box
              key={airport.iata_code}
              onClick={() => handleSelect(airport)}
              sx={{
                px: 2,
                py: 1,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Plane style={{ height: 14, width: 14, flexShrink: 0, color: 'var(--muted-foreground)' }} />
              <Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  {airport.city_name || airport.name} ({airport.iata_code})
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  {airport.name}{airport.country_code ? ` \u00B7 ${airport.country_code}` : ''}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {open && loading && (
        <Box sx={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, bgcolor: 'background.paper', p: 2, mt: 0.5 }}>
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', textAlign: 'center' }}>Searching...</Typography>
        </Box>
      )}
    </Box>
  );
}
