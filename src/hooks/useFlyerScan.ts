/**
 * useFlyerScan — Manages flyer scan lifecycle: upload → analyze → map to form fields.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// ── Types ─────────────────────────────────────────────────────────────

export interface ExtractedField {
  value: unknown;
  confidence: number;
  source: string;
}

export interface VenueCandidate {
  id: string;
  name: string;
  score: number;
  address: string;
  city: string;
  city_id: string | null;
  country_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface FlyerScanResult {
  scan_id: string | null;
  detected_type: 'event' | 'venue';
  extraction: {
    raw_text: string;
    language: string;
    fields: Record<string, ExtractedField>;
  };
  matches: {
    venue_candidates: VenueCandidate[];
    city: { id: string; name: string } | null;
    country: { id: string; name: string } | null;
    duplicate_events: Array<{ id: string; title: string; start_date: string; score: number }>;
    duplicate_venues: Array<{ id: string; name: string; score: number }>;
  };
  processing_time_ms: number;
}

export type ScanState = 'idle' | 'uploading' | 'analyzing' | 'results' | 'error';

// ── Image resize helper ───────────────────────────────────────────────

function resizeImage(file: File, maxDim: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      // Always convert through canvas to guarantee JPEG output
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas resize failed'))),
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useFlyerScan() {
  const { user } = useAuth();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [result, setResult] = useState<FlyerScanResult | null>(null);
  const [detectedType, setDetectedType] = useState<'event' | 'venue' | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setScanState('idle');
    setResult(null);
    setDetectedType(null);
    setImageUrl(null);
    setError(null);
  }, []);

  const startScan = useCallback(
    async (file: File) => {
      if (!user) {
        setError('Sign in required to scan flyers');
        setScanState('error');
        return;
      }

      try {
        setError(null);
        setScanState('uploading');

        // Resize image to max 1024px
        const resized = await resizeImage(file, 1024);

        // Upload to flyer-scans bucket
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('flyer-scans')
          .upload(fileName, resized, { cacheControl: '3600', contentType: 'image/jpeg' });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { data: urlData } = supabase.storage.from('flyer-scans').getPublicUrl(fileName);
        const publicUrl = urlData.publicUrl;
        setImageUrl(publicUrl);

        // Call analyze-flyer edge function
        setScanState('analyzing');
        const { data, error: fnError } = await supabase.functions.invoke('analyze-flyer', {
          body: { image_url: publicUrl },
        });

        if (fnError) {
          const msg = fnError.message || '';
          if (msg.includes('Rate limit') || msg.includes('429')) {
            throw new Error("You've reached the scan limit. Please try again in an hour.");
          }
          throw new Error(msg || 'Analysis failed');
        }
        if (data?.error) throw new Error(data.error);

        const scanResult = data as FlyerScanResult;
        setResult(scanResult);
        setDetectedType(scanResult.detected_type);
        setScanState('results');
      } catch (err: any) {
        console.error('Flyer scan error:', err);
        setError(err.message || 'Failed to analyze flyer');
        setScanState('error');
      }
    },
    [user],
  );

  /** Map extraction fields to the submission form schema based on detected type */
  const applyToForm = useCallback(
    (selectedVenueId?: string): Record<string, unknown> => {
      if (!result) return {};

      const fields = result.extraction.fields;
      const getVal = (key: string) => {
        const f = fields[key];
        return f && f.confidence > 0.2 ? f.value : undefined;
      };

      const formData: Record<string, unknown> = {};

      // If a venue candidate was selected, use its full data
      if (selectedVenueId) {
        const venue = result.matches.venue_candidates.find((v) => v.id === selectedVenueId);
        if (venue) {
          if (detectedType === 'event') {
            formData.venue_name = venue.name;
          } else {
            formData.name = venue.name;
          }
          formData.address = venue.address;
          formData.city = venue.city;
          if (venue.city_id) formData.city_id = venue.city_id;
          if (venue.country_id) formData.country_id = venue.country_id;
          if (venue.latitude) formData.latitude = venue.latitude;
          if (venue.longitude) formData.longitude = venue.longitude;
        }
      }

      if (detectedType === 'event' || detectedType === null) {
        // Event fields
        if (getVal('title')) formData.title = getVal('title');
        if (getVal('description')) formData.description = getVal('description');
        if (getVal('event_type')) formData.event_type = getVal('event_type');
        if (getVal('start_date')) formData.start_date = getVal('start_date');
        if (getVal('end_date')) formData.end_date = getVal('end_date');
        if (!selectedVenueId && getVal('venue_name')) formData.venue_name = getVal('venue_name');
        if (!selectedVenueId && getVal('address')) formData.address = getVal('address');
        if (!selectedVenueId && getVal('city')) formData.city = getVal('city');
        if (!selectedVenueId && getVal('country')) formData.country = getVal('country');
        if (getVal('organizer_name')) formData.organizer_name = getVal('organizer_name');
        if (getVal('organizer_contact')) formData.organizer_contact = getVal('organizer_contact');
        if (getVal('ticket_url')) formData.ticket_url = getVal('ticket_url');
        if (getVal('website')) formData.website = getVal('website');
        if (getVal('is_free') !== undefined) formData.is_free = getVal('is_free');
        if (getVal('price_text')) {
          const priceText = getVal('price_text') as string;
          const match = priceText.match(/(\d+)/);
          if (match) formData.price_min = parseInt(match[1], 10);
        }
        if (getVal('age_restriction')) formData.age_restriction = getVal('age_restriction');
      } else {
        // Venue fields
        if (!selectedVenueId && getVal('name')) formData.name = getVal('name');
        if (getVal('description')) formData.description = getVal('description');
        if (getVal('category')) formData.category = getVal('category');
        if (!selectedVenueId && getVal('address')) formData.address = getVal('address');
        if (!selectedVenueId && getVal('city')) formData.city = getVal('city');
        if (!selectedVenueId && getVal('country')) formData.country = getVal('country');
        if (getVal('postal_code')) formData.postal_code = getVal('postal_code');
        if (getVal('phone')) formData.phone = getVal('phone');
        if (getVal('email')) formData.email = getVal('email');
        if (getVal('website')) formData.website = getVal('website');
        if (getVal('instagram')) formData.instagram = getVal('instagram');
      }

      // Set matched city/country IDs
      if (!selectedVenueId) {
        if (result.matches.city?.id) formData.city_id = result.matches.city.id;
        if (result.matches.country?.id) formData.country_id = result.matches.country.id;
      }

      // Add the flyer image to the images array
      if (imageUrl) {
        formData.images = [imageUrl];
      }

      return formData;
    },
    [result, detectedType, imageUrl],
  );

  return {
    scanState,
    result,
    detectedType,
    imageUrl,
    error,
    startScan,
    reset,
    setDetectedType,
    applyToForm,
  };
}
