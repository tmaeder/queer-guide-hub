import React, { useEffect, useMemo, useState } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Search, Link2, Hash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDynamicSitemap } from '@/hooks/useDynamicSitemap';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Container from '@mui/material/Container';import { useTranslation } from 'react-i18next';

function setMetaTag(name: string, content: string) {
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(href: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.href = href;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export default function Sitemap() {
  const [query, setQuery] = useState('');
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const { data: routes = [], isLoading, error } = useDynamicSitemap();

  useEffect(() => {
    document.title = 'Sitemap | Queer Guide';
    setMetaTag(
      'description',
      'Browse the full HTML sitemap of Queer Guide: venues, events, marketplace, tags, groups, news and more.',
    );
    setCanonical('https://queer.guide/sitemap');
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return routes;
    return routes
      .map((section) => ({
        title: section.title,
        links: section.links.filter((l) =>
          [l.label, l.to].some((v) => v.toLowerCase().includes(q)),
        ),
      }))
      .filter((s) => s.links.length > 0);
  }, [query, routes]);

  const counts = useMemo(() => {
    const total = routes.reduce((acc, s) => acc + s.links.length, 0);
    const visible = filtered.reduce((acc, s) => acc + s.links.length, 0);
    return { total, visible };
  }, [routes, filtered]);

  const jsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Queer Guide HTML Sitemap',
      itemListElement: routes.flatMap((section, sIdx) =>
        section.links.map((l, idx) => ({
          '@type': 'ListItem',
          position: sIdx * 100 + idx + 1,
          name: l.label,
          url: `https://queer.guide${l.to}`,
        })),
      ),
    }),
    [routes],
  );

  const handleCopySectionLink = async (id: string) => {
    try {
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard API may fail */
    }
  };

  if (isLoading) {
    return (
      <Container sx={{ py: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.025em', mb: 2 }}>
          Queer Guide Sitemap
        </Typography>
        <Typography color="text.secondary">Loading dynamic sitemap...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ py: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.025em', mb: 2 }}>
          Queer Guide Sitemap
        </Typography>
        <Typography color="text.secondary">
          Failed to load sitemap. Please try again later.
        </Typography>
      </Container>
    );
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Box component="header" sx={{ py: 4 }}>
        <Container>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <LocalizedLink to="/" style={{ marginLeft: -8, fontWeight: 700 }}>
              Queer Guide
            </LocalizedLink>
            <Typography
              component="a"
              href="https://github.com/tmaeder/queer-guide-hub"
              variant="body2"
              sx={{ textUnderlineOffset: '4px', '&:hover': { textDecoration: 'underline' } }}
            >
              GitHub
            </Typography>
          </Box>
        </Container>
        <Container>
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.025em' }}>
            Queer Guide Sitemap
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Quickly jump to any main section.{' '}
            <Typography component="span" aria-live="polite">
              Showing {counts.visible} of {counts.total} links
            </Typography>
          </Typography>

          <Box sx={{ mt: 2 }}>
            <Box sx={{ position: 'relative', maxWidth: '36rem' }}>
              <Search
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 16,
                  height: 16,
                  color: 'var(--mui-palette-text-secondary)',
                }}
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter pages by name or path"
                aria-label="Filter sitemap links"

              />
              {query && (
                <Button
                  variant="secondary"
                  style={{
                    position: 'absolute',
                    right: 4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                  onClick={() => setQuery('')}
                  aria-label="Clear filter"
                >
                  Clear
                </Button>
              )}
            </Box>
          </Box>
        </Container>
      </Box>

      <Container>
        <Box
          component="main"
          sx={{ display: 'grid', gap: 3, gridTemplateColumns: { md: '240px 1fr' } }}
        >
          <Box component="aside" sx={{ position: { md: 'sticky' }, top: { md: 96 } }}>
            <Paper component="nav" aria-label="Section jump navigation" sx={{ p: 1.5 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Hash style={{ width: 16, height: 16 }} /> Sections
              </Typography>
              <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {filtered.map((section) => {
                  const id = slugify(section.title);
                  return (
                    <li key={section.title}>
                      <Typography
                        component="a"
                        href={`#${id}`}
                        variant="body2"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderRadius: 1,
                          px: 1,
                          py: 0.5,
                          '&:hover': { bgcolor: 'action.hover' },
                          '&:focus-visible': {
                            outline: 'none',
                            boxShadow: (theme) => `0 0 0 2px ${theme.palette.primary.main}`,
                          },
                        }}
                      >
                        <span>{section.title}</span>
                        <Typography component="span" color="text.secondary">
                          {section.links.length}
                        </Typography>
                      </Typography>
                    </li>
                  );
                })}
              </Box>
            </Paper>
          </Box>

          <Box
            component="section"
            aria-label="Sitemap"
            sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
          >
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { sm: '1fr 1fr' } }}>
              {filtered.map((section) => {
                const id = slugify(section.title);
                return (
                  <Paper component="article" key={section.title} id={id} sx={{ p: 2 }}>
                    <Box
                      component="header"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1.5,
                        mb: 1.5,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        <Typography
                          component="a"
                          href={`#${id}`}
                          sx={{
                            textUnderlineOffset: '4px',
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          {section.title}
                        </Typography>
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopySectionLink(id)}
                          aria-label={`Copy link to ${section.title}`}
                        >
                          <Link2 style={{ width: 16, height: 16 }} />
                        </Button>
                        <Typography variant="body2" color="text.secondary">
                          {section.links.length}
                        </Typography>
                      </Box>
                    </Box>

                    {copied === id && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mb: 1 }}
                        role="status"
                      >
                        Copied section link
                      </Typography>
                    )}

                    {/* Hierarchical list rendering: indent items under their hubs */}
                    <Box
                      component="ul"
                      sx={{
                        listStyleType: 'disc',
                        pl: 2.5,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                      }}
                    >
                      {(() => {
                        const aboutChildren = new Set([
                          'About',
                          'Contact',
                          'Press',
                          'Blog',
                          'Sustainability',
                        ]);
                        const legalChildren = new Set([
                          'Terms of Service',
                          'Privacy Policy',
                          'Cookie Policy',
                          'DMCA',
                        ]);
                        const links = section.links;
                        const childrenByHub: Record<string, { label: string; to: string }[]> = {
                          'About Hub': links.filter((l) => aboutChildren.has(l.label)),
                          'Legal Hub': links.filter((l) => legalChildren.has(l.label)),
                        };
                        const rootLinks = links.filter(
                          (l) => !(aboutChildren.has(l.label) || legalChildren.has(l.label)),
                        );

                        return rootLinks.map((link) => {
                          const children =
                            childrenByHub[link.label as keyof typeof childrenByHub] || [];
                          if (children.length === 0) {
                            return (
                              <li key={link.to}>
                                <LocalizedLink
                                  to={link.to}
                                  style={{ display: 'block', borderRadius: 4 }}
                                  aria-label={`${link.label} page in ${section.title}`}
                                  aria-describedby={`${id}-${slugify(link.label)}-subtitle`}
                                >
                                  <Typography component="span" sx={{ fontWeight: 500 }}>
                                    {link.label}
                                  </Typography>
                                  <Typography
                                    component="span"
                                    id={`${id}-${slugify(link.label)}-subtitle`}
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: 'block' }}
                                  >
                                    Page &bull; {link.to}
                                  </Typography>
                                  <Typography
                                    component="span"
                                    sx={{
                                      position: 'absolute',
                                      width: 1,
                                      height: 1,
                                      overflow: 'hidden',
                                      clip: 'rect(0,0,0,0)',
                                    }}
                                  >
                                    In section {section.title}
                                  </Typography>
                                </LocalizedLink>
                              </li>
                            );
                          }
                          return (
                            <li key={link.to}>
                              <LocalizedLink
                                to={link.to}
                                style={{ display: 'block', borderRadius: 4 }}
                                aria-label={`${link.label} hub in ${section.title}`}
                                aria-describedby={`${id}-${slugify(link.label)}-subtitle`}
                              >
                                <Typography component="span" sx={{ fontWeight: 500 }}>
                                  {link.label}
                                </Typography>
                                <Typography
                                  component="span"
                                  id={`${id}-${slugify(link.label)}-subtitle`}
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: 'block' }}
                                >
                                  Hub &bull; {link.to}
                                </Typography>
                                <Typography
                                  component="span"
                                  sx={{
                                    position: 'absolute',
                                    width: 1,
                                    height: 1,
                                    overflow: 'hidden',
                                    clip: 'rect(0,0,0,0)',
                                  }}
                                >
                                  In section {section.title}
                                </Typography>
                              </LocalizedLink>
                              <Box
                                component="ul"
                                sx={{
                                  mt: 1,
                                  listStyleType: 'disc',
                                  pl: 2.5,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 0.5,
                                }}
                              >
                                {children.map((cl) => (
                                  <li key={cl.to}>
                                    <LocalizedLink
                                      to={cl.to}
                                      style={{ display: 'block', borderRadius: 4 }}
                                      aria-label={`${cl.label} page under ${link.label} in ${section.title}`}
                                      aria-describedby={`${id}-${slugify(link.label)}-${slugify(cl.label)}-subtitle`}
                                    >
                                      <Typography component="span" sx={{ fontWeight: 500 }}>
                                        {cl.label}
                                      </Typography>
                                      <Typography
                                        component="span"
                                        id={`${id}-${slugify(link.label)}-${slugify(cl.label)}-subtitle`}
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ display: 'block' }}
                                      >
                                        Under {link.label} &bull; {cl.to}
                                      </Typography>
                                      <Typography
                                        component="span"
                                        sx={{
                                          position: 'absolute',
                                          width: 1,
                                          height: 1,
                                          overflow: 'hidden',
                                          clip: 'rect(0,0,0,0)',
                                        }}
                                      >
                                        In section {section.title}
                                      </Typography>
                                    </LocalizedLink>
                                  </li>
                                ))}
                              </Box>
                            </li>
                          );
                        });
                      })()}
                    </Box>
                  </Paper>
                );
              })}
            </Box>

            <Box sx={{ pt: 1 }}>
              <Typography
                component="a"
                href="#top"
                variant="body2"
                sx={{ textUnderlineOffset: '4px', '&:hover': { textDecoration: 'underline' } }}
              >
                Back to top
              </Typography>
            </Box>
          </Box>
        </Box>
      </Container>
    </>
  );
}
