import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import { MapPin, Navigation, Loader2 } from 'lucide-react';

interface LocationSuggestion {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function LocationAutocomplete({
  value,
  onChange,
  placeholder = "Search for a location...",
  className
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const searchLocations = async (query: string) => {
    if (!query.trim() || query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    
    try {
      // Use Supabase edge function to make the Mapbox API call
      const response = await fetch('/functions/v1/mapbox-geocoding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.features || []);
        setIsOpen(true);
      }
    } catch (error) {
      console.error('Error fetching location suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (inputValue: string) => {
    onChange(inputValue);
    
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce the search
    timeoutRef.current = setTimeout(() => {
      searchLocations(inputValue);
    }, 300);
  };

  const handleSelectSuggestion = (suggestion: LocationSuggestion) => {
    onChange(suggestion.place_name);
    setSuggestions([]);
    setIsOpen(false);
  };

  const detectLocation = async () => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser');
      return;
    }

    setIsDetectingLocation(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes
        });
      });

      const { latitude, longitude } = position.coords;
      
      // Use reverse geocoding to get the location name
      const response = await fetch('/functions/v1/mapbox-geocoding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query: `${longitude},${latitude}`,
          isReverseGeocode: true
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          onChange(data.features[0].place_name);
        }
      }
    } catch (error) {
      console.error('Error detecting location:', error);
    } finally {
      setIsDetectingLocation(false);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={placeholder}
            className={className}
            onFocus={() => value.length >= 3 && setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          />
          
          {isLoading && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            </div>
          )}
        </div>
        
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={detectLocation}
          disabled={isDetectingLocation}
          title="Detect my location"
        >
          {isDetectingLocation ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
        </Button>
      </div>
      
      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-md">
          <Command>
            <CommandList className="max-h-48">
              {suggestions.map((suggestion) => (
                <CommandItem
                  key={suggestion.id}
                  onSelect={() => handleSelectSuggestion(suggestion)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm">{suggestion.text}</span>
                    <span className="text-xs text-muted-foreground">
                      {suggestion.place_name}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}