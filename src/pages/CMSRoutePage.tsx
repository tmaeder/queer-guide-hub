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
 *   - Legal section: sidebar TOC via LegalPageLayout, custom hub layout
 *   - Loading skeleton + 404 fallback
 *   - SEO meta via useMeta hook
 */

import { useCMSPage } from '@/hooks/useCMSPage';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import { ChevronRight, FileText, Shield, Cookie, Scale } from 'lucide-react';
import { useCMSPage } from '@/hooks/useCMSPage';
import DOMPurify from 'dompurify';
import { useMeta } from '@/hooks/useMeta';
import { LegalPageLayout } from '@/components/ui/LegalPageLayout';
import { transition } from '@/lib/animation';
import type { CMSPage } from '@/types/cms';
import type { LucideIcon } from 'lucide-react';

interface CMSRoutePageProps {
  slug: string;
}

// ── Legal hub icon mapping ──────────────────────────────────────────────────
const legalPageIcons: Record<string, LucideIcon> = {
  terms: FileText,
  privacy: Shield,
  cookies: Cookie,
  dmca: Scale,
};

// ── Heading extraction for TOC ──────────────────────────────────────────────
function extractSections(html: string): { sections: { id: string; title: string }[]; htmlWithIds: string } {
  const div = document.createElement('div');
  div.innerHTML = html;
  const sections: { id: string; title: string }[] = [];

  div.querySelectorAll('h2').forEach((h2) => {
    const text = h2.textContent?.trim() || '';
    if (!text) return;
    const id = h2.id || text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    h2.setAttribute('id', id);
    sections.push({ id, title: text });
  });

  return { sections, htmlWithIds: div.innerHTML };
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <Container sx={{ py: 4 }}>
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

// ── Shared HTML body styles ─────────────────────────────────────────────────
const htmlBodySx = {
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
  '& a': { color: 'brand.main', '&:hover': { opacity: 0.85 } },
  '& img': { maxWidth: '100%', height: 'auto', my: 2 },
  '& pre': {
    bgcolor: 'grey.900',
    color: 'grey.100',
    p: 2,
    overflow: 'auto',
    my: 2,
    fontSize: '0.875rem',
  },
  '& code': {
    bgcolor: 'action.hover',
    px: 0.75,
    py: 0.25,
    fontSize: '0.875em',
  },
  '& table': { borderCollapse: 'collapse', width: '100%', my: 2 },
  '& th, & td': { border: 1, borderColor: 'divider', px: 1.5, py: 1, textAlign: 'left' },
  '& th': { bgcolor: 'action.hover', fontWeight: 600 },
  '& hr': { borderColor: 'divider', my: 3 },
  '& strong': { fontWeight: 600 },
  '& .legal-intro': { fontSize: '1.0625rem', color: 'text.secondary', mb: 3 },
} as const;

// ── Generic child page card (non-legal) ─────────────────────────────────────
function ChildPageCard({ page }: { page: CMSPage }) {
  return (
    <Box
      component={LocalizedLink}
      to={`/${page.slug}`}
      sx={{
        p: 2.5,
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        transition: transition.fast,
        bgcolor: 'background.paper',
        '&:hover': { opacity: 0.85 },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
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
      <ChevronRight size={18} style={{ flexShrink: 0, marginTop: 2, color: 'hsl(var(--muted-foreground))' }} />
    </Box>
  );
}

// ── Legal hub card ──────────────────────────────────────────────────────────
function LegalHubCard({ page }: { page: CMSPage }) {
  const Icon = legalPageIcons[page.slug] || FileText;

  return (
    <Box
      component={LocalizedLink}
      to={`/${page.slug}`}
      sx={{
        p: 3,
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        bgcolor: 'background.paper',
        transition: transition.fast,
        '&:hover': {
          opacity: 0.85,
          '& .legal-icon': { color: 'brand.main' },
        },
      }}
    >
      <Box className="legal-icon" sx={{ color: 'text.secondary', transition: transition.fast, mt: 0.25 }}>
        <Icon size={22} />
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
      <ChevronRight size={16} style={{ flexShrink: 0, marginTop: 4, color: 'hsl(var(--muted-foreground))' }} />
    </Box>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function CMSRoutePage({ slug }: CMSRoutePageProps) {
  const { data, isLoading: loading } = useCMSPage(slug);
  const page = data?.page ?? null;
  const parentPage = data?.parent ?? null;
  const childPages = data?.children ?? [];
  const notFound = !!data && data.notFound;

  const isLegalHub = slug === 'legal';
  const isLegalChild = page?.parent_slug === 'legal';
  const isLegalSection = isLegalHub || isLegalChild;

  useMeta({
    title: page?.meta_title || page?.title || '',
    description: page?.meta_description || page?.excerpt || '',
    canonicalPath: `/${slug}`,
  });

  if (loading) return <PageSkeleton />;

  if (notFound || !page) {
    return (
      <Container sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Page Not Found
        </Typography>
        <Typography variant="body1" color="text.secondary">
          The page you're looking for doesn't exist or hasn't been published yet.
        </Typography>
      </Container>
    );
  }

  // All CMS HTML is sanitized through DOMPurify before rendering
  const sanitizedHtml = page.body_html
    ? DOMPurify.sanitize(page.body_html, { ADD_ATTR: ['id'] })
    : '';

  // ── Legal hub layout ────────────────────────────────────────────────────
  if (isLegalHub) {
    return (
      <Container sx={{ py: { xs: 4, md: 6 }, maxWidth: 900 }}>
        <Typography variant="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
          The Legal Stuff
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 600 }}>
          Transparency matters. Here's everything about how we operate, protect your data, and keep this space safe.
        </Typography>

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1.5,
        }}>
          {childPages.map((child) => (
            <LegalHubCard key={child.slug} page={child} />
          ))}
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 5 }}>
          Questions? Reach out at{' '}
          <Box
            component="a"
            href="mailto:legal@queer.guide"
            sx={{ color: 'brand.main', '&:hover': { opacity: 0.85 } }}
          >
            legal@queer.guide
          </Box>
        </Typography>
      </Container>
    );
  }

  // ── Legal child pages (terms, privacy, cookies) ─────────────────────────
  if (isLegalChild && sanitizedHtml) {
    const { sections, htmlWithIds } = extractSections(sanitizedHtml);

    const formatDate = (d: string) => {
      try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
      catch { return d; }
    };

    return (
      <>
        {parentPage && (
          <Container sx={{ pt: 2, maxWidth: 1100 }}>
            <Breadcrumbs
              separator={<ChevronRight size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />}
            >
              <Link
                component={LocalizedLink}
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
          </Container>
        )}
        <LegalPageLayout
          title={page.title}
          subtitle={page.subtitle || undefined}
          lastUpdated={page.updated_at ? formatDate(page.updated_at) : undefined}
          sections={sections}
        >
          <Box
            dangerouslySetInnerHTML={{ __html: htmlWithIds }}
            sx={{
              ...htmlBodySx,
              '& h1': { display: 'none' },
            }}
          />
        </LegalPageLayout>
      </>
    );
  }

  // ── Default CMS page layout ─────────────────────────────────────────────
  return (
    <Container sx={{ py: 4 }}>
      {parentPage && (
        <Breadcrumbs
          separator={<ChevronRight size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />}
          sx={{ mb: 2 }}
        >
          <Link
            component={LocalizedLink}
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

      {page.cover_image_url && (
        <Box
          component="img"
          src={page.cover_image_url}
          alt={page.cover_image_alt || page.title}
          sx={{ width: '100%', maxHeight: 400, objectFit: 'cover', mb: 3 }}
        />
      )}

      {sanitizedHtml && (
        <Box dangerouslySetInnerHTML={{ __html: sanitizedHtml }} sx={htmlBodySx} />
      )}

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

      {!isLegalSection && page.tags && page.tags.length > 0 && (
        <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          {page.tags.map((tag) => (
            <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
          ))}
        </Box>
      )}
    </Container>
  );
}
