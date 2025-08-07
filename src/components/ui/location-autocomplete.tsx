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
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (address: string, coordinates?: { lat: number; lng: number }) => void;
  onValidation?: (isValid: boolean) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  label?: string;
}

export function LocationAutocomplete({ 
  value, 
  onChange, 
  onValidation, 
  placeholder = "Search for an address...",
  required = false,
  className,
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
    } catch (error) {
      console.error('Geocoding error:', error);
      
      // Check if it's a configuration error
      if (error.message?.includes('non-2xx status code')) {
        toast({
          title: "Configuration Required",
          description: "Mapbox API key needs to be configured. Using basic address input for now.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Search Error",
          description: "Failed to search addresses. Please try again.",
          variant: "destructive"
        });
      }
      
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsValidated(false);
    setSelectedIndex(-1);
    
    if (newValue !== value) {
      onChange(newValue);
      onValidation?.(false);
    }

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce search
    timeoutRef.current = setTimeout(() => {
      searchAddresses(newValue);
    }, 300);
  };

  const handleSuggestionSelect = (suggestion: LocationSuggestion) => {
    const coordinates = {
      lat: suggestion.center[1],
      lng: suggestion.center[0]
    };
    
    setInputValue(suggestion.place_name);
    onChange(suggestion.place_name, coordinates);
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
        const firstResult = data.features[0];
        const coordinates = {
          lat: firstResult.center[1],
          lng: firstResult.center[0]
        };
        
        onChange(firstResult.place_name, coordinates);
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
          maximumAge: 300000, // 5 minutes
        });
      });

      const { latitude, longitude } = position.coords;
      
      // Use reverse geocoding to get the location name
      const { data, error } = await supabase.functions.invoke('mapbox-geocoding', {
        body: { 
          query: `${longitude},${latitude}`,
          isReverseGeocode: true
        }
      });

      if (error) throw error;

      if (data.features && data.features.length > 0) {
        const location = data.features[0];
        const coordinates = {
          lat: latitude,
          lng: longitude
        };
        
        setInputValue(location.place_name);
        onChange(location.place_name, coordinates);
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
    <div className="relative space-y-2">
      {label && (
        <Label htmlFor="address">{label} {required && '*'}</Label>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            id="address"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            required={required}
            className={`pr-20 ${isValidated ? 'border-green-500' : ''} ${className}`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
            {isValidated && (
              <Check className="h-4 w-4 text-green-500" />
            )}
            {isLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={validateCurrentAddress}
              disabled={isLoading || !inputValue.trim()}
              className="h-6 px-2"
              title="Validate address"
            >
              <MapPin className="h-3 w-3" />
            </Button>
          </div>
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

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto mt-1"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              className={`w-full text-left px-3 py-2 hover:bg-muted focus:bg-muted focus:outline-none ${
                index === selectedIndex ? 'bg-muted' : ''
              }`}
              onClick={() => handleSuggestionSelect(suggestion)}
            >
              <div className="flex items-start space-x-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {suggestion.place_name}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}