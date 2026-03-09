/**
 * CMSRoutePage — Renders CMS-managed pages at fixed routes.
 *
 * Used for pages like /about, /terms, /privacy that are now stored in
 * the cms_pages table rather than being hardcoded React components.
 *
 * Props:
 *   slug — The CMS page slug to fetch and render.
 *
 * Features:
 *   - Fetches published page by slug from cms_pages
 *   - DOMPurify-sanitized HTML rendering with styled typography
 *   - Hub hierarchy support (parent breadcrumb + child page listing)
 *   - Loading skeleton + 404 fallback
 *   - SEO meta via useMeta hook
 */

import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import { ChevronRight, FileText } from 'lucide-react';
import { api } from '@/integrations/api/client';
import DOMPurify from 'dompurify';
import { useMeta } from '@/hooks/useMeta';
import type { CMSPage } from '@/types/cms';

interface CMSRoutePageProps {
  slug: string;
}

/** Skeleton shown while loading */
function PageSkeleton() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Skeleton variant="text" width={120} height={24} sx={{ mb: 2 }} />
      <Skeleton variant="text" width="70%" height={48} sx={{ mb: 1 }} />
      <Skeleton variant="text" width="50%" height={28} sx={{ mb: 4 }} />
      <Skeleton variant="rounded" height={200} sx={{ mb: 2 }} />
      <Skeleton variant="text" width="100%" height={20} />
      <Skeleton variant="text" width="90%" height={20} />
      <Skeleton variant="text" width="95%" height={20} />
      <Skeleton variant="text" width="80%" height={20} />
    </Container>
  );
}

/** Child page card shown on hub pages */
function ChildPageCard({ page }: { page: CMSPage }) {
  const slugToPath = (s: string) => `/${s}`;

  return (
    <Paper
      component={RouterLink}
      to={slugToPath(page.slug)}
      elevation={0}
      variant="outlined"
      sx={{
        p: 2.5,
        borderRadius: '12px',
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: 'action.hover',
          transform: 'translateY(-1px)',
          boxShadow: '0 2px 8px rgb(0 0 0 / 0.08)',
        },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '10px',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <FileText size={20} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.25 }}>
          {page.title}
        </Typography>
        {page.subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
            {page.subtitle}
          </Typography>
        )}
      </Box>
      <ChevronRight size={18} style={{ flexShrink: 0, marginTop: 2, color: '#94a3b8' }} />
    </Paper>
  );
}

export default function CMSRoutePage({ slug }: CMSRoutePageProps) {
  const [page, setPage] = useState<CMSPage | null>(null);
  const [parentPage, setParentPage] = useState<CMSPage | null>(null);
  const [childPages, setChildPages] = useState<CMSPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // SEO meta
  useMeta({
    title: page?.meta_title || page?.title || '',
    description: page?.meta_description || page?.excerpt || '',
    canonicalPath: `/${slug}`,
  });

  useEffect(() => {
    loadPage(slug);
  }, [slug]);

  async function loadPage(pageSlug: string) {
    setLoading(true);
    setNotFound(false);
    setParentPage(null);
    setChildPages([]);

    try {
      // Fetch the page
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

      const pageData = data as CMSPage;
      setPage(pageData);

      // If page has a parent, fetch it for breadcrumb
      if (pageData.parent_slug) {
        const { data: parent } = await supabase
          .from('cms_pages' as any)
          .select('slug, title, subtitle')
          .eq('slug', pageData.parent_slug)
          .eq('workflow_state', 'published')
          .single();

        if (parent) {
          setParentPage(parent as CMSPage);
        }
      }

      // Check if this page is a hub (has children)
      const { data: children } = await supabase
        .from('cms_pages' as any)
        .select('slug, title, subtitle, excerpt, category')
        .eq('parent_slug', pageSlug)
        .eq('workflow_state', 'published')
        .order('title');

      if (children && children.length > 0) {
        setChildPages(children as CMSPage[]);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <PageSkeleton />;
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
      {/* Breadcrumb with parent link */}
      {parentPage && (
        <Breadcrumbs
          separator={<ChevronRight size={14} style={{ color: '#94a3b8' }} />}
          sx={{ mb: 2 }}
        >
          <Link
            component={RouterLink}
            to={`/${parentPage.slug}`}
            underline="hover"
            color="text.secondary"
            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
          >
            {parentPage.title}
          </Link>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            {page.title}
          </Typography>
        </Breadcrumbs>
      )}

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

      {/* Body */}
      {sanitizedHtml && (
        <Box
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          sx={{
            '& h1': { fontSize: '2rem', fontWeight: 700, mt: 0, mb: 2, lineHeight: 1.2 },
            '& h2': { fontSize: '1.5rem', fontWeight: 700, mt: 4, mb: 1.5, lineHeight: 1.25 },
            '& h3': { fontSize: '1.25rem', fontWeight: 600, mt: 3, mb: 1, lineHeight: 1.3 },
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
            '& strong': { fontWeight: 600 },
          }}
        />
      )}

      {/* Child pages section for hub pages */}
      {childPages.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            Related Pages
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {childPages.map((child) => (
              <ChildPageCard key={child.slug} page={child} />
            ))}
          </Box>
        </Box>
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
