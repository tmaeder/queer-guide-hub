/**
 * ExternalImageSearch
 * Tabbed search panel for external image sources: Stock Photos (Pexels + Unsplash)
 * and Wikimedia Commons. Renders inside MediaPickerDialog.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Tabs,
  Tab,
  ImageList,
  ImageListItem,
  CircularProgress,
  Stack,
  Chip,
  Alert,
  Button,
  Tooltip,
} from '@mui/material';
import { Search, Check, ExternalLink, Camera } from 'lucide-react';
import {
  useExternalImageSearch,
  type ExternalImage,
} from '@/hooks/useExternalImageSearch';

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

  const handleTabChange = (_: unknown, value: SourceTab) => {
    setActiveTab(value);
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search input */}
      <Box sx={{ px: 0, pb: 1.5 }}>
        <TextField
          size="small"
          fullWidth
          placeholder={
            activeTab === 'stock'
              ? 'Search Pexels & Unsplash...'
              : 'Search Wikimedia Commons...'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          slotProps={{
            input: {
              startAdornment: <Search size={16} className="text-gray-400 mr-2" />,
            },
          }}
        />
      </Box>

      {/* Source tabs */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        variant="fullWidth"
        sx={{ minHeight: 36, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab
          icon={<Camera size={14} />}
          iconPosition="start"
          label="Stock Photos"
          value="stock"
          sx={{ minHeight: 36, py: 0, fontSize: '0.8125rem' }}
        />
        <Tab
          label="Wikimedia Commons"
          value="wikimedia"
          sx={{ minHeight: 36, py: 0, fontSize: '0.8125rem' }}
        />
      </Tabs>

      {/* Results */}
      <Box sx={{ flex: 1, overflow: 'auto', pt: 1.5 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && displayResults.length === 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress  aria-label="Loading"/>
          </Box>
        )}

        {!loading && displayResults.length === 0 && query.trim() && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Camera size={48} className="text-gray-300" style={{ margin: '0 auto 8px' }} />
            <Typography variant="body2" color="text.secondary">
              No images found for &ldquo;{query}&rdquo;
            </Typography>
          </Box>
        )}

        {!query.trim() && !loading && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Search size={48} className="text-gray-300" style={{ margin: '0 auto 8px' }} />
            <Typography variant="body2" color="text.secondary">
              Enter a search term to find images
            </Typography>
          </Box>
        )}

        {displayResults.length > 0 && (
          <>
            <ImageList cols={3} gap={8} sx={{ m: 0 }}>
              {displayResults.map((image) => {
                const isSelected = selectedId === image.id;

                return (
                  <ImageListItem
                    key={image.id}
                    onClick={() => {
                      setSelectedId(image.id);
                      onSelect(image);
                    }}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: 1,
                      overflow: 'hidden',
                      border: 2,
                      borderColor: isSelected ? 'primary.main' : 'transparent',
                      position: 'relative',
                      '&:hover': {
                        borderColor: isSelected ? 'primary.main' : 'action.hover',
                      },
                      bgcolor: 'grey.50',
                    }}
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
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          bgcolor: 'primary.main',
                          borderRadius: '50%',
                          width: 24,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={14} color="white" />
                      </Box>
                    )}

                    {/* Source badge */}
                    <Chip
                      label={image.source === 'wikipedia' ? 'Wiki' : image.source}
                      size="small"
                      sx={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        height: 20,
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        bgcolor: SOURCE_COLORS[image.source] || '#666',
                        color: 'white',
                        textTransform: 'capitalize',
                      }}
                    />

                    {/* Info */}
                    <Box sx={{ p: 0.75 }}>
                      <Tooltip title={image.alt}>
                        <Typography
                          variant="caption"
                          noWrap
                          display="block"
                          sx={{ fontWeight: 500, fontSize: '0.7rem' }}
                        >
                          {image.alt}
                        </Typography>
                      </Tooltip>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        display="block"
                        sx={{ fontSize: '0.65rem' }}
                      >
                        {image.photographer}
                      </Typography>
                    </Box>
                  </ImageListItem>
                );
              })}
            </ImageList>

            {/* Load more (stock photos only, Wikipedia returns all at once) */}
            {activeTab === 'stock' && !loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <Button variant="outlined" size="small" onClick={handleLoadMore}>
                  Load more
                </Button>
              </Box>
            )}

            {loading && displayResults.length > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} aria-label="Loading" />
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Selected image attribution */}
      {selectedImage && (
        <Box
          sx={{
            mt: 1,
            p: 1.5,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'grey.50',
            borderRadius: 1,
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              component="img"
              src={selectedImage.thumbnail}
              alt=""
              sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 0.5 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" fontWeight={600} noWrap display="block">
                {selectedImage.photographer}
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                {selectedImage.license && (
                  <Chip
                    label={selectedImage.license}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem' }}
                  />
                )}
                {selectedImage.source_page_url && (
                  <Tooltip title="View on source site">
                    <a
                      href={selectedImage.source_page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'flex' }}
                    >
                      <ExternalLink size={12} className="text-gray-400" />
                    </a>
                  </Tooltip>
                )}
              </Stack>
            </Box>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
