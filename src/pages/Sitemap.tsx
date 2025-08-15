import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Link2, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const routes: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "Explore",
    links: [
      { label: "Home", to: "/" },
      { label: "Venues", to: "/venues" },
      { label: "Events", to: "/events" },
      { label: "Marketplace", to: "/marketplace" },
      { label: "Directory", to: "/directory" },
      { label: "Users", to: "/users" },
      { label: "Ressources", to: "/ressources" },
      { label: "Knowledge Base", to: "/knowledge" },
      { label: "News", to: "/news" },
      { label: "Travel", to: "/travel" },
      { label: "Groups", to: "/groups" },
      { label: "My Groups", to: "/my-groups" },
      { label: "Feed", to: "/feed" },
      { label: "Favorites", to: "/favorites" },
      { label: "Search", to: "/search" },
    ],
  },
  {
    title: "About & Legal",
    links: [
      { label: "About Hub", to: "/about-hub" },
      { label: "About", to: "/about" },
      { label: "Contact", to: "/contact" },
      { label: "Press", to: "/press" },
      { label: "Blog", to: "/blog" },
      { label: "Sustainability", to: "/sustainability" },
      { label: "Legal Hub", to: "/legal" },
      { label: "Terms of Service", to: "/terms" },
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Cookie Policy", to: "/cookies" },
      { label: "DMCA", to: "/dmca" },
      { label: "Accessibility", to: "/accessibility" },
    ],
  },
];

function setMetaTag(name: string, content: string) {
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.href = href;
}

function slugify(input: string) {
  return input.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

export default function Sitemap() {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Sitemap | Queer Guide";
    setMetaTag(
      "description",
      "Browse the full HTML sitemap of Queer Guide: venues, events, marketplace, tags, groups, news and more."
    );
    setCanonical("https://queer.guide/sitemap");
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return routes;
    return routes
      .map((section) => ({
        title: section.title,
        links: section.links.filter((l) =>
          [l.label, l.to].some((v) => v.toLowerCase().includes(q))
        ),
      }))
      .filter((s) => s.links.length > 0);
  }, [query]);

  const counts = useMemo(() => {
    const total = routes.reduce((acc, s) => acc + s.links.length, 0);
    const visible = filtered.reduce((acc, s) => acc + s.links.length, 0);
    return { total, visible };
  }, [filtered]);

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Queer Guide HTML Sitemap",
      itemListElement: routes.flatMap((section, sIdx) =>
        section.links.map((l, idx) => ({
          "@type": "ListItem",
          position: sIdx * 100 + idx + 1,
          name: l.label,
          url: `https://queer.guide${l.to}`,
        }))
      ),
    }),
    []
  );

  const handleCopySectionLink = async (id: string) => {
    try {
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="py-8">
        <div className="container">
          <div className="flex items-center justify-between">
            <Link to="/" className="group -ml-2 font-bold">
              Queer Guide <span className="text-muted-foreground group-hover:underline">v3 Alpha</span>
            </Link>
            <a
              href="https://github.com/jakejarvis/queer.guide"
              className="text-sm underline-offset-4 hover:underline"
            >
              GitHub
            </a>
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Queer Guide Sitemap</h1>
        <p className="text-muted-foreground mt-2">
          Quickly jump to any main section. {" "}
          <span aria-live="polite">Showing {counts.visible} of {counts.total} links</span>
        </p>

        <div className="mt-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter pages by name or path"
              aria-label="Filter sitemap links"
              className="pl-9"
            />
            {query && (
              <Button
                variant="secondary"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setQuery("")}
                aria-label="Clear filter"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="grid gap-6 md:grid-cols-[240px,1fr]">
        <aside className="md:sticky md:top-24">
          <nav aria-label="Section jump navigation" className="border rounded-lg p-3 bg-card">
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Hash className="h-4 w-4" /> Sections
            </h2>
            <ul className="space-y-1 text-sm">
              {filtered.map((section) => {
                const id = slugify(section.title);
                return (
                  <li key={section.title}>
                    <a
                      href={`#${id}`}
                      className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

        <section aria-label="Sitemap" className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {filtered.map((section) => {
              const id = slugify(section.title);
              return (
                <article key={section.title} id={id} className="border rounded-lg p-4 bg-card">
                  <header className="flex items-center justify-between gap-3 mb-3">
                    <h2 className="text-xl font-semibold">
                      <a href={`#${id}`} className="hover:underline underline-offset-4">
                        {section.title}
                      </a>
                    </h2>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopySectionLink(id)}
                        aria-label={`Copy link to ${section.title}`}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">{section.links.length}</span>
                    </div>
                  </header>

                  {copied === id && (
                    <p className="text-xs text-muted-foreground mb-2" role="status">Copied section link</p>
                  )}

                  {/* Hierarchical list rendering: indent items under their hubs */}
                  <ul className="space-y-2 list-disc pl-5">
                    {(() => {
                      const aboutChildren = new Set(["About", "Contact", "Press", "Blog", "Sustainability"]);
                      const legalChildren = new Set(["Terms of Service", "Privacy Policy", "Cookie Policy", "DMCA"]);
                      const links = section.links;
                      const childrenByHub: Record<string, { label: string; to: string }[]> = {
                        "About Hub": links.filter((l) => aboutChildren.has(l.label)),
                        "Legal Hub": links.filter((l) => legalChildren.has(l.label)),
                      };
                      const rootLinks = links.filter(
                        (l) => !(aboutChildren.has(l.label) || legalChildren.has(l.label))
                      );

                      return rootLinks.map((link) => {
                        const children = childrenByHub[link.label as keyof typeof childrenByHub] || [];
                        if (children.length === 0) {
                          return (
                            <li key={link.to}>
                              <Link
                                to={link.to}
                                className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded block"
                                aria-label={`${link.label} page in ${section.title}`}
                                aria-describedby={`${id}-${slugify(link.label)}-subtitle`}
                              >
                                <span className="font-medium">{link.label}</span>
                                <span id={`${id}-${slugify(link.label)}-subtitle`} className="block text-xs text-muted-foreground">Page • {link.to}</span>
                                <span className="sr-only">In section {section.title}</span>
                              </Link>
                            </li>
                          );
                        }
                        return (
                          <li key={link.to}>
                            <Link
                              to={link.to}
                              className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded block"
                              aria-label={`${link.label} hub in ${section.title}`}
                              aria-describedby={`${id}-${slugify(link.label)}-subtitle`}
                            >
                              <span className="font-medium">{link.label}</span>
                              <span id={`${id}-${slugify(link.label)}-subtitle`} className="block text-xs text-muted-foreground">Hub • {link.to}</span>
                              <span className="sr-only">In section {section.title}</span>
                            </Link>
                            <ul className="mt-2 list-disc pl-5 space-y-1">
                              {children.map((cl) => (
                                <li key={cl.to}>
                                  <Link
                                    to={cl.to}
                                    className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded block"
                                    aria-label={`${cl.label} page under ${link.label} in ${section.title}`}
                                    aria-describedby={`${id}-${slugify(link.label)}-${slugify(cl.label)}-subtitle`}
                                  >
                                    <span className="font-medium">{cl.label}</span>
                                    <span id={`${id}-${slugify(link.label)}-${slugify(cl.label)}-subtitle`} className="block text-xs text-muted-foreground">Under {link.label} • {cl.to}</span>
                                    <span className="sr-only">In section {section.title}</span>
                                  </Link>
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
            <a href="#top" className="text-sm underline-offset-4 hover:underline">Back to top</a>
          </div>
        </section>
      </main>
    </>
  );
}
