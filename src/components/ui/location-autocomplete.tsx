import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MapPin, Check, Navigation, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface LocationSuggestion {
  id: string;
  place_name: string;
  center: [number, number];
  context?: Array<{ id: string; text: string }>;
  properties?: Record<string, unknown>;
}

export interface AddressComponents {
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
  street?: string;
  housenumber?: string;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (address: string, coordinates?: { lat: number; lng: number }, components?: AddressComponents) => void;
  onValidation?: (isValid: boolean) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
}

export function LocationAutocomplete({
  value,
  onChange,
  onValidation,
  placeholder = "Search for an address...",
  required = false,
  disabled = false,
  label = "Address"
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isValidated, setIsValidated] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const searchAddresses = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
        body: {
          query,
          types: ['address', 'poi']
        }
      });

      if (error) throw error;

      setSuggestions(data.features || []);
      setShowSuggestions(true);
    } catch (error: unknown) {
      console.error('Geocoding error:', error);

      toast({
        title: "Search Error",
        description: "Failed to search addresses. Please try again.",
        variant: "destructive"
      });

      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;

    const newValue = e.target.value;
    setInputValue(newValue);
    setIsValidated(false);
    setSelectedIndex(-1);

    if (newValue !== value) {
      onChange(newValue);
      onValidation?.(false);
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      searchAddresses(newValue);
    }, 300);
  };

  const extractComponents = (suggestion: LocationSuggestion): AddressComponents => {
    const props = suggestion.properties || {};
    const components: AddressComponents = {};
    if (props.city) components.city = props.city;
    if (props.state) components.state = props.state;
    if (props.country) components.country = props.country;
    if (props.postcode) components.postcode = props.postcode;
    if (props.street) components.street = props.street;
    if (props.housenumber) components.housenumber = props.housenumber;
    // Fallback: extract from context array if properties are missing
    // Mapbox context IDs have format "place.12345", "region.67890", etc.
    if (!components.city || !components.country) {
      for (const ctx of suggestion.context || []) {
        const ctxType = ctx.id.split('.')[0];
        if (ctxType === 'place' && !components.city) components.city = ctx.text;
        if (ctxType === 'region' && !components.state) components.state = ctx.text;
        if (ctxType === 'country' && !components.country) components.country = ctx.text;
        if (ctxType === 'postcode' && !components.postcode) components.postcode = ctx.text;
      }
    }
    return components;
  };

  const handleSuggestionSelect = (suggestion: LocationSuggestion) => {
    const coordinates = {
      lat: suggestion.center[1],
      lng: suggestion.center[0]
    };
    const components = extractComponents(suggestion);

    setInputValue(suggestion.place_name);
    onChange(suggestion.place_name, coordinates, components);
    setIsValidated(true);
    setShowSuggestions(false);
    onValidation?.(true);

    toast({
      title: "Address Selected",
      description: "Location has been validated and coordinates updated.",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSuggestionSelect(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const validateCurrentAddress = async () => {
    if (!inputValue.trim()) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
        body: {
          query: inputValue,
          types: ['address']
        }
      });

      if (error) throw error;

      if (data.features && data.features.length > 0) {
        const firstResult = data.features[0] as LocationSuggestion;
        const coordinates = {
          lat: firstResult.center[1],
          lng: firstResult.center[0]
        };
        const components = extractComponents(firstResult);

        onChange(firstResult.place_name, coordinates, components);
        setInputValue(firstResult.place_name);
        setIsValidated(true);
        onValidation?.(true);

        toast({
          title: "Address Validated",
          description: "Address has been validated and coordinates updated.",
        });
      } else {
        setIsValidated(false);
        onValidation?.(false);
        toast({
          title: "Invalid Address",
          description: "Could not validate this address. Please check and try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        title: "Validation Error",
        description: "Failed to validate address. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const detectLocation = async () => {
    if (!navigator.geolocation) {
      toast({
        title: "Location Error",
        description: "Geolocation is not supported by this browser.",
        variant: "destructive"
      });
      return;
    }

    setIsDetectingLocation(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        });
      });

      const { latitude, longitude } = position.coords;

      const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
        body: {
          query: `${longitude},${latitude}`,
          isReverseGeocode: true
        }
      });

      if (error) throw error;

      if (data.features && data.features.length > 0) {
        const location = data.features[0] as LocationSuggestion;
        const coordinates = {
          lat: latitude,
          lng: longitude
        };
        const components = extractComponents(location);

        setInputValue(location.place_name);
        onChange(location.place_name, coordinates, components);
        setIsValidated(true);
        onValidation?.(true);

        toast({
          title: "Location Detected",
          description: "Your current location has been detected and validated.",
        });
      }
    } catch (error) {
      console.error('Error detecting location:', error);
      toast({
        title: "Location Error",
        description: "Failed to detect your location. Please try again or enter manually.",
        variant: "destructive"
      });
    } finally {
      setIsDetectingLocation(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {label && (
        <Label htmlFor="address">{label} {required && '*'}</Label>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Input
            ref={inputRef}
            id="address"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            style={{
              paddingRight: 80,
              ...(isValidated ? { borderColor: '#22c55e' } : {}),
            }}
          />
          <div style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            {isValidated && (
              <Check style={{ height: 16, width: 16, color: '#22c55e' }} />
            )}
            {isLoading && (
              <Loader2 style={{ height: 12, width: 12, color: 'hsl(var(--muted-foreground))', animation: 'spin 1s linear infinite' }} />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={validateCurrentAddress}
              disabled={disabled || isLoading || !inputValue.trim()}
              style={{ height: 24, padding: '0 8px' }}
              title="Validate address"
            >
              <MapPin style={{ height: 12, width: 12 }} />
            </Button>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={detectLocation}
          disabled={disabled || isDetectingLocation}
          title="Detect my location"
        >
          {isDetectingLocation ? (
            <Loader2 style={{ height: 16, width: 16, animation: 'spin 1s linear infinite' }} />
          ) : (
            <Navigation style={{ height: 16, width: 16 }} />
          )}
        </Button>
      </div>

      {!disabled && showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          style={{
            position: 'absolute',
            zIndex: 50,
            width: '100%',
            top: '100%',
            marginTop: 4,
            backgroundColor: 'hsl(var(--background))',
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                border: 'none',
                background: index === selectedIndex ? 'hsl(var(--accent))' : 'transparent',
                cursor: 'pointer',
                display: 'block',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'hsl(var(--accent))'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = index === selectedIndex ? 'hsl(var(--accent))' : 'transparent'; }}
              onClick={() => handleSuggestionSelect(suggestion)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <MapPin style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))', marginTop: 2, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {suggestion.place_name}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
