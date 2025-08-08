import React, { useEffect } from "react";
import { Link } from "react-router-dom";

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
      { label: "Tags", to: "/tags" },
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

export default function Sitemap() {
  useEffect(() => {
    document.title = "Sitemap | Queer Guide";
    setMetaTag("description", "Browse the full HTML sitemap of Queer Guide: venues, events, marketplace, tags, groups, news and more.");
    setCanonical("https://queer.guide/sitemap");
  }, []);

  const jsonLd = {
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
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="py-8">
        <h1 className="text-3xl font-bold tracking-tight">HTML Sitemap</h1>
        <p className="text-muted-foreground mt-2">Quickly find any main section of Queer Guide.</p>
      </header>
      <main>
        <nav aria-label="Sitemap">
          <div className="grid gap-8 sm:grid-cols-2">
            {routes.map((section) => (
              <section key={section.title} className="border rounded-lg p-4 bg-card">
                <h2 className="text-xl font-semibold mb-3">{section.title}</h2>
                <ul className="space-y-2 list-disc pl-5">
                  {section.links.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} className="underline-offset-4 hover:underline">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>
      </main>
    </>
  );
}
