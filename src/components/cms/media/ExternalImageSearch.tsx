/**
 * ExternalImageSearch
 * Tabbed search panel for external image sources: Stock Photos (Pexels + Unsplash)
 * and Wikimedia Commons. Renders inside MediaPickerDialog.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Check, ExternalLink, Camera, Loader2 } from 'lucide-react';
import {
  useExternalImageSearch,
  type ExternalImage,
} from '@/hooks/useExternalImageSearch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ExternalImageSearchProps {
  onSelect: (image: ExternalImage) => void;
  initialQuery?: string;
}

type SourceTab = 'stock' | 'wikimedia';

const SOURCE_COLORS: Record<string, string> = {
  pexels: '#05A081',
  unsplash: '#111',
  wikipedia: '#069',
};

export default function ExternalImageSearch({
  onSelect,
  initialQuery = '',
}: ExternalImageSearchProps) {
  const { results, loading, error, searchPexelsUnsplash, searchWikipedia, clearResults } =
    useExternalImageSearch();

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SourceTab>('stock');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(
    (q: string, p: number, tab: SourceTab) => {
      if (!q.trim()) {
        clearResults();
        return;
      }
      if (tab === 'stock') {
        searchPexelsUnsplash(q, p);
      } else {
        searchWikipedia(q);
      }
    },
    [searchPexelsUnsplash, searchWikipedia, clearResults],
  );

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setSelectedId(null);
      doSearch(query, 1, activeTab);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeTab, doSearch]);

  // Search on initial mount if initialQuery provided
  useEffect(() => {
    if (initialQuery.trim()) {
      doSearch(initialQuery, 1, activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value as SourceTab);
    setSelectedId(null);
    clearResults();
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    doSearch(query, nextPage, activeTab);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setPage(1);
      setSelectedId(null);
      doSearch(query, 1, activeTab);
    }
  };

  const selectedImage = results.find((r) => r.id === selectedId);

  // Filter results for stock tab (show both pexels + unsplash)
  const displayResults =
    activeTab === 'stock'
      ? results.filter((r) => r.source === 'pexels' || r.source === 'unsplash')
      : results.filter((r) => r.source === 'wikipedia');

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="px-0 pb-3 relative">
        <Search
          size={16}
          className="text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        />
        <Input
          placeholder={
            activeTab === 'stock'
              ? 'Search Pexels & Unsplash...'
              : 'Search Wikimedia Commons...'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-9 h-9"
        />
      </div>

      {/* Source tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList variant="fullWidth" className="border-b border-border min-h-9">
          <TabsTrigger value="stock" className="text-[0.8125rem]">
            <Camera size={14} className="mr-1" />
            Stock Photos
          </TabsTrigger>
          <TabsTrigger value="wikimedia" className="text-[0.8125rem]">
            Wikimedia Commons
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Results */}
      <div className="flex-1 overflow-auto pt-3">
        {error && (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && displayResults.length === 0 && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
          </div>
        )}

        {!loading && displayResults.length === 0 && query.trim() && (
          <div className="text-center py-12">
            <Camera size={48} className="text-gray-300" style={{ margin: '0 auto 8px' }} />
            <p className="text-sm text-muted-foreground">
              No images found for &ldquo;{query}&rdquo;
            </p>
          </div>
        )}

        {!query.trim() && !loading && (
          <div className="text-center py-12">
            <Search size={48} className="text-gray-300" style={{ margin: '0 auto 8px' }} />
            <p className="text-sm text-muted-foreground">
              Enter a search term to find images
            </p>
          </div>
        )}

        {displayResults.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2 m-0">
              {displayResults.map((image) => {
                const isSelected = selectedId === image.id;

                return (
                  <div
                    key={image.id}
                    onClick={() => {
                      setSelectedId(image.id);
                      onSelect(image);
                    }}
                    className={`cursor-pointer rounded overflow-hidden border-2 relative bg-gray-50 hover:border-muted ${
                      isSelected ? 'border-primary hover:border-primary' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={image.thumbnail}
                      alt={image.alt}
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: 140,
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />

                    {/* Selected checkmark */}
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 bg-primary rounded-full w-6 h-6 flex items-center justify-center">
                        <Check size={14} color="white" />
                      </div>
                    )}

                    {/* Source badge */}
                    <span
                      className="absolute top-1.5 left-1.5 h-5 px-1.5 text-[0.65rem] font-semibold text-white rounded capitalize flex items-center"
                      style={{ backgroundColor: SOURCE_COLORS[image.source] || '#666' }}
                    >
                      {image.source === 'wikipedia' ? 'Wiki' : image.source}
                    </span>

                    {/* Info */}
                    <div className="p-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-[0.7rem] font-medium block truncate">
                            {image.alt}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>{image.alt}</TooltipContent>
                      </Tooltip>
                      <p className="text-[0.65rem] text-muted-foreground block truncate">
                        {image.photographer}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load more (stock photos only, Wikipedia returns all at once) */}
            {activeTab === 'stock' && !loading && (
              <div className="flex justify-center py-3">
                <Button variant="outline" size="sm" onClick={handleLoadMore}>
                  Load more
                </Button>
              </div>
            )}

            {loading && displayResults.length > 0 && (
              <div className="flex justify-center py-3">
                <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Selected image attribution */}
      {selectedImage && (
        <div className="mt-1 p-3 border-t border-border bg-gray-50 rounded">
          <div className="flex flex-row gap-3 items-center">
            <img
              src={selectedImage.thumbnail}
              alt=""
              className="w-10 h-10 object-cover rounded-sm"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold block truncate">
                {selectedImage.photographer}
              </p>
              <div className="flex flex-row gap-1 items-center">
                {selectedImage.license && (
                  <Badge variant="outline" className="h-[18px] text-[0.6rem]">
                    {selectedImage.license}
                  </Badge>
                )}
                {selectedImage.source_page_url && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={selectedImage.source_page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex' }}
                      >
                        <ExternalLink size={12} className="text-gray-400" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>View on source site</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
