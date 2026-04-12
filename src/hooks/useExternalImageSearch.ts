/**
 * useExternalImageSearch
 * Hook for searching external image sources: Pexels, Unsplash, and Wikimedia Commons.
 * Pexels + Unsplash are fetched via the existing get-pexels-images edge function.
 * Wikimedia Commons is called directly (public API, no key needed).
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ExternalImage {
  id: string;
  url: string;
  thumbnail: string;
  alt: string;
  photographer: string;
  photographer_url: string;
  source: 'pexels' | 'unsplash' | 'wikipedia';
  license?: string;
  source_page_url?: string;
  width?: number;
  height?: number;
}

interface WikimediaPage {
  pageid: number;
  title: string;
  imageinfo?: Array<{
    url: string;
    thumburl: string;
    descriptionurl: string;
    width: number;
    height: number;
    extmetadata?: {
      Artist?: { value: string };
      LicenseShortName?: { value: string };
      ImageDescription?: { value: string };
    };
  }>;
}

export interface UseExternalImageSearchReturn {
  results: ExternalImage[];
  loading: boolean;
  error: string | null;
  searchPexelsUnsplash: (query: string, page?: number) => Promise<void>;
  searchWikipedia: (query: string) => Promise<void>;
  clearResults: () => void;
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

export function useExternalImageSearch(): UseExternalImageSearchReturn {
  const [results, setResults] = useState<ExternalImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchPexelsUnsplash = useCallback(async (query: string, page = 1) => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('get-pexels-images', {
        body: { query: query.trim(), page },
      });

      if (fnError) throw fnError;

      if (!data?.success || !Array.isArray(data.images)) {
        throw new Error(data?.error || 'No results returned');
      }

      const mapped: ExternalImage[] = data.images.map((img: Record<string, unknown>) => ({
        id: img.id,
        url: img.url,
        thumbnail: img.thumbnail,
        alt: img.alt || query,
        photographer: img.photographer || 'Unknown',
        photographer_url: img.photographer_url || '',
        source: (img.source || 'pexels') as 'pexels' | 'unsplash',
        license: img.source === 'unsplash' ? 'Unsplash License' : 'Pexels License',
        source_page_url: img.photographer_url || '',
      }));

      if (page === 1) {
        setResults(mapped);
      } else {
        setResults(prev => [...prev, ...mapped]);
      }
    } catch (err) {
      console.error('Pexels/Unsplash search error:', err);
      setError((err as Error).message || 'Failed to search stock photos');
    } finally {
      setLoading(false);
    }
  }, []);

  const searchWikipedia = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: query.trim(),
        gsrnamespace: '6', // File namespace
        gsrlimit: '20',
        prop: 'imageinfo',
        iiprop: 'url|extmetadata|size',
        iiurlwidth: '400',
        format: 'json',
        origin: '*',
      });

      const resp = await fetch(
        `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
      );

      if (!resp.ok) {
        throw new Error(`Wikimedia API error: ${resp.status}`);
      }

      const data = await resp.json();
      const pages: Record<string, WikimediaPage> = data.query?.pages || {};

      const mapped: ExternalImage[] = Object.values(pages)
        .filter((page) => page.imageinfo && page.imageinfo.length > 0)
        .map((page) => {
          const info = page.imageinfo![0];
          const meta = info.extmetadata || {};

          return {
            id: `wiki-${page.pageid}`,
            url: info.url,
            thumbnail: info.thumburl || info.url,
            alt: meta.ImageDescription
              ? stripHtml(meta.ImageDescription.value)
              : page.title.replace('File:', ''),
            photographer: meta.Artist ? stripHtml(meta.Artist.value) : 'Unknown',
            photographer_url: info.descriptionurl || '',
            source: 'wikipedia' as const,
            license: meta.LicenseShortName?.value || 'Wikimedia Commons',
            source_page_url: info.descriptionurl,
            width: info.width,
            height: info.height,
          };
        });

      setResults(mapped);
    } catch (err) {
      console.error('Wikipedia search error:', err);
      setError((err as Error).message || 'Failed to search Wikimedia Commons');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    results,
    loading,
    error,
    searchPexelsUnsplash,
    searchWikipedia,
    clearResults,
  };
}
