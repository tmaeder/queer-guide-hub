import { useEffect, useMemo, useState } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Search, Link2, Hash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDynamicSitemap } from '@/hooks/useDynamicSitemap';
import { useTranslation } from 'react-i18next';

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
  const { _t } = useTranslation();
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
      <div className="container mx-auto py-8 px-4">
        <h4 className="text-3xl font-bold tracking-tight mb-4">Queer Guide Sitemap</h4>
        <p className="text-muted-foreground">Loading dynamic sitemap...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <h4 className="text-3xl font-bold tracking-tight mb-4">Queer Guide Sitemap</h4>
        <p className="text-muted-foreground">
          Failed to load sitemap. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <LocalizedLink to="/" style={{ marginLeft: -8, fontWeight: 700 }}>
              Queer Guide
            </LocalizedLink>
            <a
              href="https://github.com/tmaeder/queer-guide-hub"
              className="text-sm underline-offset-4 hover:underline"
            >
              GitHub
            </a>
          </div>
        </div>
        <div className="container mx-auto px-4">
          <h4 className="text-3xl font-bold tracking-tight">Queer Guide Sitemap</h4>
          <p className="text-muted-foreground mt-2">
            Quickly jump to any main section.{' '}
            <span aria-live="polite">
              Showing {counts.visible} of {counts.total} links
            </span>
          </p>

          <div className="mt-4">
            <div className="relative max-w-xl">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
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
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setQuery('')}
                  aria-label="Clear filter"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4">
        <main className="grid gap-6 md:grid-cols-[240px_1fr]">
          <aside className="md:sticky md:top-24">
            <nav aria-label="Section jump navigation" className="p-3 bg-card rounded-lg border border-border">
              <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Hash className="w-4 h-4" /> Sections
              </p>
              <ul className="flex flex-col gap-1">
                {filtered.map((section) => {
                  const id = slugify(section.title);
                  return (
                    <li key={section.title}>
                      <a
                        href={`#${id}`}
                        className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span>{section.title}</span>
                        <span className="text-muted-foreground">{section.links.length}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <section aria-label="Sitemap" className="flex flex-col gap-6">
            <div className="grid gap-6 sm:grid-cols-2">
              {filtered.map((section) => {
                const id = slugify(section.title);
                return (
                  <article key={section.title} id={id} className="p-4 bg-card rounded-lg border border-border">
                    <header className="flex items-center justify-between gap-3 mb-3">
                      <h6 className="text-base font-semibold">
                        <a
                          href={`#${id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {section.title}
                        </a>
                      </h6>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopySectionLink(id)}
                          aria-label={`Copy link to ${section.title}`}
                        >
                          <Link2 className="w-4 h-4" />
                        </Button>
                        <span className="text-sm text-muted-foreground">{section.links.length}</span>
                      </div>
                    </header>

                    {copied === id && (
                      <span className="block text-xs text-muted-foreground mb-2" role="status">
                        Copied section link
                      </span>
                    )}

                    <ul className="list-disc pl-6 flex flex-col gap-2">
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
                                  <span className="font-medium">{link.label}</span>
                                  <span
                                    id={`${id}-${slugify(link.label)}-subtitle`}
                                    className="block text-xs text-muted-foreground"
                                  >
                                    Page &bull; {link.to}
                                  </span>
                                  <span className="sr-only">In section {section.title}</span>
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
                                <span className="font-medium">{link.label}</span>
                                <span
                                  id={`${id}-${slugify(link.label)}-subtitle`}
                                  className="block text-xs text-muted-foreground"
                                >
                                  Hub &bull; {link.to}
                                </span>
                                <span className="sr-only">In section {section.title}</span>
                              </LocalizedLink>
                              <ul className="mt-2 list-disc pl-6 flex flex-col gap-1">
                                {children.map((cl) => (
                                  <li key={cl.to}>
                                    <LocalizedLink
                                      to={cl.to}
                                      style={{ display: 'block', borderRadius: 4 }}
                                      aria-label={`${cl.label} page under ${link.label} in ${section.title}`}
                                      aria-describedby={`${id}-${slugify(link.label)}-${slugify(cl.label)}-subtitle`}
                                    >
                                      <span className="font-medium">{cl.label}</span>
                                      <span
                                        id={`${id}-${slugify(link.label)}-${slugify(cl.label)}-subtitle`}
                                        className="block text-xs text-muted-foreground"
                                      >
                                        Under {link.label} &bull; {cl.to}
                                      </span>
                                      <span className="sr-only">In section {section.title}</span>
                                    </LocalizedLink>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          );
                        });
                      })()}
                    </ul>
                  </article>
                );
              })}
            </div>

            <div className="pt-2">
              <a
                href="#top"
                className="text-sm underline-offset-4 hover:underline"
              >
                Back to top
              </a>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
