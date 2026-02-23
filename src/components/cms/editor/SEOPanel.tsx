/**
 * SEOPanel - SEO metadata editing panel for the CMS editor sidebar.
 * Provides fields for meta_title, meta_description, and canonical_url.
 * Includes character counts and a Google SERP preview.
 */

import React, { useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import { Globe, Search } from 'lucide-react';
import type { CMSContentMetadata } from '@/types/cms';
import { cn } from '@/lib/utils';

interface SEOPanelProps {
  metadata: CMSContentMetadata | null;
  onUpdate: (updates: Partial<CMSContentMetadata>) => Promise<void>;
}

const META_TITLE_MAX = 60;
const META_DESCRIPTION_MAX = 160;

export function SEOPanel({ metadata, onUpdate }: SEOPanelProps) {
  const metaTitle = metadata?.meta_title ?? '';
  const metaDescription = metadata?.meta_description ?? '';
  const canonicalUrl = metadata?.canonical_url ?? '';

  const handleMetaTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ meta_title: e.target.value });
    },
    [onUpdate],
  );

  const handleMetaDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate({ meta_description: e.target.value });
    },
    [onUpdate],
  );

  const handleCanonicalUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ canonical_url: e.target.value });
    },
    [onUpdate],
  );

  // Character count styling
  const titleCountColor = metaTitle.length > META_TITLE_MAX ? 'error.main' : 'text.secondary';
  const descCountColor = metaDescription.length > META_DESCRIPTION_MAX ? 'error.main' : 'text.secondary';

  // Google preview values
  const previewTitle = metaTitle || 'Page Title';
  const previewUrl = canonicalUrl || 'https://queer.guide/...';
  const previewDescription = metaDescription || 'Add a meta description to see a preview of how this page will appear in search results.';

  // Truncate for preview
  const truncatedTitle = useMemo(
    () => previewTitle.length > 60 ? previewTitle.slice(0, 57) + '...' : previewTitle,
    [previewTitle],
  );
  const truncatedDescription = useMemo(
    () => previewDescription.length > 160 ? previewDescription.slice(0, 157) + '...' : previewDescription,
    [previewDescription],
  );

  const isDisabled = !metadata;

  return (
    <Box className="flex flex-col gap-4">
      {/* Meta Title */}
      <Box>
        <Box className="flex items-center justify-between mb-1">
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Meta Title
          </Typography>
          <Typography variant="caption" sx={{ color: titleCountColor, fontSize: '0.7rem' }}>
            {metaTitle.length}/{META_TITLE_MAX}
          </Typography>
        </Box>
        <TextField
          value={metaTitle}
          onChange={handleMetaTitleChange}
          placeholder="Enter SEO title..."
          size="small"
          fullWidth
          disabled={isDisabled}
          inputProps={{ maxLength: 70 }}
          sx={{
            '& .MuiOutlinedInput-root': { fontSize: '0.875rem' },
          }}
        />
      </Box>

      {/* Meta Description */}
      <Box>
        <Box className="flex items-center justify-between mb-1">
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Meta Description
          </Typography>
          <Typography variant="caption" sx={{ color: descCountColor, fontSize: '0.7rem' }}>
            {metaDescription.length}/{META_DESCRIPTION_MAX}
          </Typography>
        </Box>
        <TextField
          value={metaDescription}
          onChange={handleMetaDescriptionChange}
          placeholder="Enter SEO description..."
          size="small"
          fullWidth
          multiline
          minRows={3}
          maxRows={5}
          disabled={isDisabled}
          inputProps={{ maxLength: 200 }}
          sx={{
            '& .MuiOutlinedInput-root': { fontSize: '0.875rem' },
          }}
        />
      </Box>

      {/* Canonical URL */}
      <Box>
        <Box className="flex items-center gap-1 mb-1">
          <Globe style={{ width: 12, height: 12, color: '#6b7280' }} />
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Canonical URL
          </Typography>
        </Box>
        <TextField
          value={canonicalUrl}
          onChange={handleCanonicalUrlChange}
          placeholder="https://queer.guide/..."
          size="small"
          fullWidth
          disabled={isDisabled}
          type="url"
          sx={{
            '& .MuiOutlinedInput-root': { fontSize: '0.875rem' },
          }}
        />
      </Box>

      <Divider />

      {/* Google SERP Preview */}
      <Box>
        <Box className="flex items-center gap-1.5 mb-2">
          <Search style={{ width: 14, height: 14, color: '#6b7280' }} />
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Google Preview
          </Typography>
        </Box>
        <Box
          className={cn(
            'rounded-lg border border-gray-200 p-3',
            'bg-white',
          )}
        >
          {/* Title line */}
          <Typography
            variant="body2"
            sx={{
              color: '#1a0dab',
              fontWeight: 500,
              fontSize: '1rem',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            {truncatedTitle}
          </Typography>

          {/* URL line */}
          <Typography
            variant="caption"
            sx={{
              color: '#006621',
              display: 'block',
              mt: 0.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.8rem',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            {previewUrl}
          </Typography>

          {/* Description */}
          <Typography
            variant="caption"
            sx={{
              color: '#545454',
              mt: 0.5,
              lineHeight: 1.4,
              fontSize: '0.8rem',
              fontFamily: 'Arial, sans-serif',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {truncatedDescription}
          </Typography>
        </Box>

        {!metadata && (
          <Typography variant="caption" color="text.secondary" className="mt-2 block">
            Save the item first to edit SEO metadata.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
