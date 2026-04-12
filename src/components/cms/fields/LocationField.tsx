import React, { useCallback, useState } from 'react';
import { FieldWrapper } from './FieldWrapper';
import type { FieldProps } from './FieldRenderer';
import {
  LocationAutocomplete,
  type AddressComponents,
} from '@/components/ui/location-autocomplete';
import { useAddressResolver } from '@/hooks/useAddressResolver';
import { supabase } from '@/integrations/supabase/client';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Location field for the 'location' type.
 * Renders a plain text address input with autocomplete suggestions.
 * When an address is selected:
 * - The address text is stored in this field
 * - Latitude/longitude are auto-populated (hidden fields)
 * - City, state, country, postal code are auto-populated
 * - city_id and country_id are auto-linked via edge function resolver
 */
export function LocationField({ field, value, onChange, error, disabled, setFields }: FieldProps) {
  const { resolveAddress } = useAddressResolver();
  const [resolved, setResolved] = useState(false);

  const handleAddressChange = useCallback(
    async (
      address: string,
      coordinates?: { lat: number; lng: number },
      components?: AddressComponents,
    ) => {
      // Always update the address text field itself
      onChange(address);
      setResolved(false);

      if (!setFields || !field.relatedFields) return;

      const updates: Record<string, unknown> = {};
      const map = field.relatedFields;

      // Auto-fill text fields from structured address components
      if (components) {
        if (map.city && components.city) updates[map.city] = components.city;
        if (map.state && components.state) updates[map.state] = components.state;
        if (map.country && components.country) updates[map.country] = components.country;
        if (map.postal_code && components.postcode) updates[map.postal_code] = components.postcode;
      }

      // Auto-populate lat/lng from coordinates
      if (coordinates) {
        const latField = map.latitude || 'latitude';
        const lngField = map.longitude || 'longitude';
        updates[latField] = coordinates.lat;
        updates[lngField] = coordinates.lng;
      }

      // Apply text field + coordinate updates immediately
      if (Object.keys(updates).length > 0) {
        setFields(updates);
      }

      // Resolve city_id/country_id via edge function
      if (components?.country) {
        const result = await resolveAddress(
          components.city,
          components.country,
          coordinates?.lat,
          coordinates?.lng,
        );
        if (result) {
          const fkUpdates: Record<string, unknown> = {};
          if (map.city_id && result.city_id) fkUpdates[map.city_id] = result.city_id;
          if (map.country_id && result.country_id) fkUpdates[map.country_id] = result.country_id;
          // Also update city/country names from resolver (may be more canonical)
          if (map.city && result.city_name) fkUpdates[map.city] = result.city_name;
          if (map.country && result.country_name) fkUpdates[map.country] = result.country_name;

          // Resolve queer village from coordinates
          if (coordinates && map.queer_village_id) {
            try {
              const { data: villages } = await supabase.rpc('find_queer_village', {
                p_lat: coordinates.lat,
                p_lng: coordinates.lng,
                p_city_id: result.city_id ?? null,
              });
              if (villages?.[0]?.village_id) {
                fkUpdates[map.queer_village_id] = villages[0].village_id;
              }
            } catch (e) {
              console.warn('Queer village resolution failed:', e);
            }
          }

          if (Object.keys(fkUpdates).length > 0) {
            setFields(fkUpdates);
          }
          setResolved(true);

          if (result.created) {
            toast.success(`New city created: ${result.city_name}`);
          }
        }
      }
    },
    [onChange, setFields, field.relatedFields, resolveAddress],
  );

  return (
    <FieldWrapper field={field} error={error}>
      <LocationAutocomplete
        value={String(value ?? '')}
        onChange={handleAddressChange}
        placeholder={field.placeholder || 'Search for an address...'}
        required={field.required}
        disabled={disabled}
      />
      {resolved && (
        <div className="flex items-center gap-1 mt-1">
          <Check className="w-3.5 h-3.5 text-green-500" />
          <span className="text-xs text-green-500">City & country linked</span>
        </div>
      )}
    </FieldWrapper>
  );
}
