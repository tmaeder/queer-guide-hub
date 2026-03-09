/**
 * Public page renderer for cms_pages.
 * Route: /p/:slug
 * Fetches published page by slug and renders HTML body.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { api } from '@/integrations/api/client';
import DOMPurify from 'dompurify';
import type { CMSPage } from '@/types/cms';

export default function Page() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<CMSPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    loadPage(slug);
  }, [slug]);

  async function loadPage(pageSlug: string) {
    setLoading(true);
    setNotFound(false);

    try {
      const { data, error } = await supabase
        .from('cms_pages' as any)
        .select('*')
        .eq('slug', pageSlug)
        .eq('workflow_state', 'published')
        .single();

      if (error || !data) {
        setNotFound(true);
        return;
      }

      setPage(data as CMSPage);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (notFound || !page) {
    return (
      <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Page Not Found
        </Typography>
        <Typography variant="body1" color="text.secondary">
          The page you're looking for doesn't exist or hasn't been published yet.
        </Typography>
      </Container>
    );
  }

  const sanitizedHtml = page.body_html ? DOMPurify.sanitize(page.body_html) : '';

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Cover image */}
      {page.cover_image_url && (
        <Box
          component="img"
          src={page.cover_image_url}
          alt={page.cover_image_alt || page.title}
          sx={{
            width: '100%',
            maxHeight: 400,
            objectFit: 'cover',
            borderRadius: 2,
            mb: 3,
          }}
        />
      )}

      {/* Header */}
      <Box sx={{ mb: 4 }}>
        {page.category && <Chip label={page.category} size="small" sx={{ mb: 1 }} />}
        <Typography variant="h3" component="h1" sx={{ fontWeight: 800, lineHeight: 1.2, mb: 1 }}>
          {page.title}
        </Typography>
        {page.subtitle && (
          <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400, mb: 1 }}>
            {page.subtitle}
          </Typography>
        )}
        {page.published_at && (
          <Typography variant="caption" color="text.secondary">
            Published{' '}
            {new Date(page.published_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Typography>
        )}
      </Box>

      {/* Body */}
      {sanitizedHtml && (
        <Box
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          sx={{
            '& h1': { fontSize: '2rem', fontWeight: 700, mt: 4, mb: 2, lineHeight: 1.2 },
            '& h2': { fontSize: '1.5rem', fontWeight: 700, mt: 3, mb: 1.5, lineHeight: 1.25 },
            '& h3': { fontSize: '1.25rem', fontWeight: 600, mt: 2.5, mb: 1, lineHeight: 1.3 },
            '& p': { fontSize: '1rem', lineHeight: 1.8, mb: 2 },
            '& ul, & ol': { pl: 3, mb: 2 },
            '& li': { mb: 0.75, lineHeight: 1.7 },
            '& blockquote': {
              borderLeft: 3,
              borderColor: 'divider',
              pl: 2,
              ml: 0,
              fontStyle: 'italic',
              color: 'text.secondary',
              my: 2,
            },
            '& a': { color: 'primary.main', textDecoration: 'underline' },
            '& img': { maxWidth: '100%', height: 'auto', borderRadius: 1, my: 2 },
            '& pre': {
              bgcolor: 'grey.900',
              color: 'grey.100',
              borderRadius: 1,
              p: 2,
              overflow: 'auto',
              my: 2,
              fontSize: '0.875rem',
            },
            '& code': {
              bgcolor: 'action.hover',
              borderRadius: 0.5,
              px: 0.75,
              py: 0.25,
              fontSize: '0.875em',
            },
            '& table': { borderCollapse: 'collapse', width: '100%', my: 2 },
            '& th, & td': { border: 1, borderColor: 'divider', px: 1.5, py: 1, textAlign: 'left' },
            '& th': { bgcolor: 'action.hover', fontWeight: 600 },
            '& hr': { borderColor: 'divider', my: 3 },
          }}
        />
      )}

      {/* Tags */}
      {page.tags && page.tags.length > 0 && (
        <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          {page.tags.map((tag) => (
            <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
          ))}
        </Box>
      )}
    </Container>
  );
}
