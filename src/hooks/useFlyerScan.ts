/**
 * useFlyerScan — Manages flyer scan lifecycle: upload → analyze → map to form fields.
 * Supports multiple files and multiple items per file.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { extractFileContent, isAcceptedFile } from '@/lib/fileExtractors';

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

export interface FlyerScanItem {
  detected_type: 'event' | 'venue';
  fields: Record<string, ExtractedField>;
  matches: {
    venue_candidates: VenueCandidate[];
    city: { id: string; name: string } | null;
    country: { id: string; name: string } | null;
    duplicate_events: Array<{ id: string; title: string; start_date: string; score: number }>;
    duplicate_venues: Array<{ id: string; name: string; score: number }>;
  };
}

export interface FlyerScanResult {
  scan_id: string | null;
  items: FlyerScanItem[];
  raw_text: string;
  language: string;
  processing_time_ms: number;
  source_file: string;
  image_url: string | null;
}

export type ScanState = 'idle' | 'uploading' | 'analyzing' | 'results' | 'error';

// ── Hook ──────────────────────────────────────────────────────────────

export function useFlyerScan() {
  const { user } = useAuth();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [results, setResults] = useState<FlyerScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  const reset = useCallback(() => {
    setScanState('idle');
    setResults([]);
    setError(null);
    setCurrentFileIndex(0);
    setTotalFiles(0);
  }, []);

  const startScan = useCallback(
    async (files: File[]) => {
      if (!user) {
        setError('Sign in required to scan flyers');
        setScanState('error');
        return;
      }

      const validFiles = files.filter(isAcceptedFile);
      if (validFiles.length === 0) {
        setError('No supported files selected. Upload images, PDFs, or DOCX files.');
        setScanState('error');
        return;
      }

      try {
        setError(null);
        setResults([]);
        setTotalFiles(validFiles.length);
        const fileErrors: string[] = [];

        for (let i = 0; i < validFiles.length; i++) {
          setCurrentFileIndex(i);
          const file = validFiles[i];

          try {
            // Extract content (image blob or text)
            setScanState('uploading');
            const content = await extractFileContent(file);

            let body: Record<string, unknown>;
            let fileImageUrl: string | null = null;

            if (content.mode === 'image' && content.imageBlob) {
              // Upload image to storage bucket
              const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
              const { error: uploadError } = await supabase.storage
                .from('flyer-scans')
                .upload(fileName, content.imageBlob, {
                  cacheControl: '3600',
                  contentType: 'image/jpeg',
                });

              if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

              const { data: urlData } = supabase.storage.from('flyer-scans').getPublicUrl(fileName);
              fileImageUrl = urlData.publicUrl;
              body = { image_url: fileImageUrl };
            } else {
              // Text mode — send text directly
              body = { text: content.text };
            }

            // Call analyze-flyer edge function
            setScanState('analyzing');
            const { data, error: fnError } = await supabase.functions.invoke('analyze-flyer', {
              body,
            });

            if (fnError) {
              const msg = fnError.message || '';
              if (msg.includes('Rate limit') || msg.includes('429')) {
                throw new Error("You've reached the scan limit. Please try again in an hour.");
              }
              throw new Error(msg || 'Analysis failed');
            }
            if (data?.error) throw new Error(data.error);

            const scanResult: FlyerScanResult = {
              scan_id: data.scan_id,
              items: data.items || [],
              raw_text: data.raw_text || '',
              language: data.language || 'en',
              processing_time_ms: data.processing_time_ms,
              source_file: file.name,
              image_url: fileImageUrl,
            };

            setResults((prev) => [...prev, scanResult]);
          } catch (err: any) {
            console.error(`Flyer scan error (file ${i + 1}):`, err);
            fileErrors.push(`${file.name}: ${err.message}`);
            // Rate limit error — stop processing remaining files
            if (err.message?.includes('scan limit')) {
              setError(err.message);
              setScanState('error');
              return;
            }
          }
        }

        // Check if we got any results
        setResults((prev) => {
          if (prev.length === 0 && fileErrors.length > 0) {
            setError(fileErrors.join('\n'));
            setScanState('error');
          } else {
            setScanState('results');
          }
          return prev;
        });
      } catch (err: any) {
        console.error('Flyer scan error:', err);
        setError(err.message || 'Failed to analyze files');
        setScanState('error');
      }
    },
    [user],
  );

  /** Map a specific item's fields to the form schema */
  const applyToForm = useCallback(
    (resultIdx: number, itemIdx: number, selectedVenueId?: string): Record<string, unknown> => {
      const result = results[resultIdx];
      if (!result) return {};

      const item = result.items[itemIdx];
      if (!item) return {};

      const { fields, detected_type, matches } = item;
      const getVal = (key: string) => {
        const f = fields[key];
        return f && f.confidence > 0.2 ? f.value : undefined;
      };

      const formData: Record<string, unknown> = {};

      // If a venue candidate was selected, use its full data
      if (selectedVenueId) {
        const venue = matches.venue_candidates.find((v) => v.id === selectedVenueId);
        if (venue) {
          if (detected_type === 'event') {
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

      if (detected_type === 'event') {
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
        if (matches.city?.id) formData.city_id = matches.city.id;
        if (matches.country?.id) formData.country_id = matches.country.id;
      }

      // Add the flyer image to the images array
      if (result.image_url) {
        formData.images = [result.image_url];
      }

      return formData;
    },
    [results],
  );

  /** Get the total number of items across all results */
  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);

  return {
    scanState,
    results,
    totalItems,
    error,
    currentFileIndex,
    totalFiles,
    startScan,
    reset,
    applyToForm,
  };
}
