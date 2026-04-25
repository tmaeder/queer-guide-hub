import React, { useEffect } from 'react';
import './pattern-library.css';
import * as P from './patterns';

type ArtboardProps = {
  label: string;
  width: number;
  height: number;
  fit?: number; // px width container is allowed to use; child scales down to fit
  children: React.ReactNode;
};

function Artboard({ label, width, height, fit, children }: ArtboardProps) {
  const maxWidth = fit ?? width;
  const scale = Math.min(1, maxWidth / width);
  return (
    <figure style={{ margin: 0, width: width * scale }}>
      <figcaption className="qg-pl-artboard-label">
        <span>{label}</span>
        <span className="dim">{width} × {height}</span>
      </figcaption>
      <div
        className="qg-pl-artboard"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          className="qg-pl-artboard-inner"
          style={{ width, height, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </figure>
  );
}

type Section = {
  id: string;
  title: string;
  boards: { label: string; w: number; h: number; el: React.ReactNode }[];
};

const SECTIONS: Section[] = [
  {
    id: 'layout',
    title: '01 — App Shell & Layout',
    boards: [
      { label: 'Home (desktop)', w: 1280, h: 840, el: <P.PatternHome /> },
      { label: 'Home (mobile)',  w: 340,  h: 680, el: <P.PatternHomeMobile /> },
    ],
  },
  {
    id: 'auth',
    title: '02 — Authentication',
    boards: [
      { label: 'Sign in',                 w: 520, h: 620, el: <P.PatternSignIn /> },
      { label: 'Sign up · onboarding',    w: 520, h: 620, el: <P.PatternSignUp /> },
      { label: 'Sign in (mobile)',        w: 340, h: 680, el: <P.PatternSignInMobile /> },
    ],
  },
  {
    id: 'city',
    title: '03 — City detail',
    boards: [
      { label: 'City detail (desktop)', w: 1280, h: 920, el: <P.PatternCity /> },
      { label: 'City detail (mobile)',  w: 340,  h: 680, el: <P.PatternCityMobile /> },
    ],
  },
  {
    id: 'venues',
    title: '04 — Venues',
    boards: [
      { label: 'Venue listings', w: 1280, h: 840, el: <P.PatternVenueList /> },
      { label: 'Venue detail',   w: 1280, h: 920, el: <P.PatternVenueDetail /> },
      { label: 'Venue (mobile)', w: 340,  h: 680, el: <P.PatternVenueMobile /> },
    ],
  },
  {
    id: 'events',
    title: '05 — Events & festivals',
    boards: [
      { label: 'Events listings',  w: 1280, h: 840, el: <P.PatternEvents /> },
      { label: 'Festival detail',  w: 1280, h: 920, el: <P.PatternFestival /> },
      { label: 'Events (mobile)',  w: 340,  h: 680, el: <P.PatternEventsMobile /> },
    ],
  },
  {
    id: 'hotels',
    title: '06 — Hotels & travel',
    boards: [
      { label: 'Hotel search',           w: 1280, h: 920, el: <P.PatternHotelSearch /> },
      { label: 'Hotel detail',           w: 1280, h: 920, el: <P.PatternHotelDetail /> },
      { label: 'Flights & travel deals', w: 1280, h: 840, el: <P.PatternTravelDeals /> },
    ],
  },
  {
    id: 'map',
    title: '07 — Interactive map',
    boards: [
      { label: 'Map view (desktop)', w: 1280, h: 840, el: <P.PatternMap /> },
      { label: 'Map view (mobile)',  w: 340,  h: 680, el: <P.PatternMapMobile /> },
    ],
  },
  {
    id: 'villages',
    title: '08 — Queer villages',
    boards: [
      { label: 'Villages directory', w: 1280, h: 840, el: <P.PatternVillages /> },
      { label: 'Village detail',     w: 1280, h: 920, el: <P.PatternVillageDetail /> },
    ],
  },
  {
    id: 'groups',
    title: '09 — Community groups',
    boards: [
      { label: 'Groups directory',     w: 1280, h: 840, el: <P.PatternGroups /> },
      { label: 'Group detail · feed',  w: 1280, h: 920, el: <P.PatternGroupDetail /> },
      { label: 'Direct messaging',     w: 1280, h: 840, el: <P.PatternMessaging /> },
    ],
  },
  {
    id: 'content',
    title: '10 — News, personalities & resources',
    boards: [
      { label: 'News index',           w: 1280, h: 840, el: <P.PatternNews /> },
      { label: 'Article',              w: 1280, h: 920, el: <P.PatternArticle /> },
      { label: 'Personalities',        w: 1280, h: 840, el: <P.PatternPersonalities /> },
      { label: 'Resources directory',  w: 1280, h: 840, el: <P.PatternResources /> },
    ],
  },
  {
    id: 'marketplace',
    title: '11 — Marketplace',
    boards: [
      { label: 'Marketplace listings', w: 1280, h: 840, el: <P.PatternMarketplace /> },
      { label: 'Listing detail',       w: 1280, h: 840, el: <P.PatternMarketDetail /> },
    ],
  },
  {
    id: 'search-tags',
    title: '12 — Search, tags & weather',
    boards: [
      { label: 'Global search', w: 1280, h: 840, el: <P.PatternSearch /> },
      { label: 'Tag graph',     w: 1280, h: 840, el: <P.PatternTags /> },
      { label: 'Weather',       w: 520,  h: 520, el: <P.PatternWeather /> },
    ],
  },
  {
    id: 'admin',
    title: '13 — Admin & CMS',
    boards: [
      { label: 'Admin dashboard',     w: 1280, h: 840, el: <P.PatternAdmin /> },
      { label: 'CMS · article editor', w: 1280, h: 840, el: <P.PatternCMS /> },
      { label: 'Security dashboard',  w: 1280, h: 840, el: <P.PatternSecurity /> },
    ],
  },
];

export default function PatternLibrary() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Querra · Pattern Library';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="qg-pl">
      <div className="qg-pl-canvas">
        <header className="qg-pl-header">
          <h1>Querra · Pattern Library</h1>
          <p>LGBTQ+ travel & community platform — one representative layout per feature area, desktop + mobile. Sourced from the Claude Design handoff.</p>
        </header>

        <nav className="qg-pl-toc" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>{s.title}</a>
          ))}
        </nav>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="qg-pl-section">
            <h2 className="qg-pl-section-title">{s.title}</h2>
            <div className="qg-pl-artboards">
              {s.boards.map((b) => (
                <Artboard key={b.label} label={b.label} width={b.w} height={b.h} fit={Math.min(b.w, 1280)}>
                  {b.el}
                </Artboard>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
