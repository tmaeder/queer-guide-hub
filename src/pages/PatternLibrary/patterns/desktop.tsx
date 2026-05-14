/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* eslint-disable */
import React from 'react';
import { Logo, PrideBar, TopNav, Footer } from './shared';

/* ============== DESKTOP PATTERNS ============== */

// Queer Guide — desktop patterns


// ── 01 Home ──────────────────────────────────────────────────────────────
export function PatternHome() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Discover" />
      {/* Masthead strip */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 40px", borderBottom: "1px solid var(--line)", fontSize: 11.5 }}>
        <span className="mono" style={{ color: "var(--muted)" }}>Vol. III · Issue 14 · Spring 2026</span>
        <span className="mono" style={{ color: "var(--muted)" }}>64 cities · 12,408 venues · 142 events this week</span>
        <span className="mono" style={{ color: "var(--accent)" }}>Live: Lisbon Pride →</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr", gap: 0, borderBottom: "1px solid var(--ink)" }}>
        {/* Left rail — ToC */}
        <aside style={{ padding: "32px 24px", borderRight: "1px solid var(--line)", fontSize: 12 }}>
          <div className="lbl" style={{ marginBottom: 14 }}>In this issue</div>
          {[
            ["01", "Lisbon Pride, slowly"],
            ["02", "What's open in Athens"],
            ["03", "Schöneberg at 100"],
            ["04", "PrEP, by country"],
            ["05", "On queer cinema, again"],
            ["06", "Letter from Mexico City"],
          ].map(([n, t]) => (
            <div key={n} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 8, padding: "8px 0", borderTop: "1px solid var(--line)", color: "var(--ink-2)" }}>
              <span className="mono" style={{ color: "var(--muted)" }}>{n}</span>
              <span style={{ fontSize: 12.5, lineHeight: 1.3 }}>{t}</span>
            </div>
          ))}
        </aside>

        {/* Hero text */}
        <div style={{ padding: "32px 32px 28px" }}>
          <div className="number">№ 142 — DISPATCH FROM LISBON</div>
          <h1 className="h-d" style={{ fontSize: 96, marginTop: 18, marginBottom: 18, letterSpacing: "-0.025em" }}>
            A guide<br /> to <em>queer</em> life,<br /> place by place.
          </h1>
          <p style={{ fontSize: 15.5, color: "var(--ink-2)", maxWidth: 460, lineHeight: 1.55, margin: 0 }}>
            Sixty-four cities, written from inside them. The bars that survived, the streets that mattered, the calendars worth keeping. Updated every week by people who live there — not who Googled it.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 26, alignItems: "center" }}>
            <button className="btn btn--accent">Read the issue →</button>
            <button className="btn btn--ghost">Browse cities</button>
            <span className="mono" style={{ color: "var(--muted)", marginLeft: 8 }}>5 min · free</span>
          </div>
        </div>

        {/* Hero image */}
        <div style={{ borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
          <div className="ph" style={{ flex: 1, minHeight: 360 }} data-ph="LISBON · PRINCIPE REAL · 06:42" />
          <figcaption style={{ padding: "12px 24px", fontSize: 11.5, color: "var(--muted)", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
            <span>Príncipe Real, the morning after the parade.</span>
            <span className="mono">PHOTO · INÊS V.</span>
          </figcaption>
        </div>
      </div>

      {/* Cities row */}
      <div style={{ padding: "28px 40px 8px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="eyebrow"><span className="num">02</span>City index</div>
        <span className="mono" style={{ color: "var(--muted)" }}>see all 64 →</span>
      </div>
      <div style={{ padding: "12px 40px 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--line)" }}>
        {[
          ["Berlin",      "Germany",  "1,240"],
          ["Mexico City", "Mexico",   "612"],
          ["Bangkok",     "Thailand", "489"],
          ["Madrid",      "Spain",    "904"],
        ].map(([c, country, v], i) => (
          <a key={c} style={{ padding: "20px 18px 22px", borderRight: i < 3 ? "1px solid var(--line)" : "none", display: "block" }}>
            <div className="ph" style={{ height: 130 }} data-ph={c.toUpperCase()} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: "-0.01em" }}>{c}</span>
              <span className="mono" style={{ color: "var(--muted)" }}>{String(i + 1).padStart(2, "0")}</span>
            </div>
            <div className="mono" style={{ color: "var(--muted)", marginTop: 4 }}>{country} · {v} venues</div>
          </a>
        ))}
      </div>

      {/* Spotlight strip */}
      <div style={{ padding: "28px 40px 0", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, borderTop: "1px solid var(--line)", marginTop: 12 }}>
        {[
          ["Athens", "Pride, this weekend",          "Six routes, three rooftops, one bookshop."],
          ["Cape Town", "Open right now",             "118 venues · the comprehensive list, finally."],
          ["Stockholm", "Letter from a regular",      "“Thirty-six hours, eleven coffees, one sauna.”"],
        ].map(([place, t, sub], i) => (
          <div key={t} style={{ padding: "24px 24px 26px", borderRight: i < 2 ? "1px solid var(--line)" : "none" }}>
            <div className="mono" style={{ color: "var(--accent)", marginBottom: 8 }}>{place.toUpperCase()}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1.1, marginBottom: 6 }}>{t}</div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      <Footer />
    </div>
  );
}

// ── 02 Auth ──────────────────────────────────────────────────────────────
export function PatternSignIn() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <div className="ph" data-ph="couple at sunset, Mykonos" style={{ height: "100%" }} />
      <div style={{ padding: 36, display: "flex", flexDirection: "column", gap: 18 }}>
        <Logo />
        <div style={{ marginTop: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Welcome back</div>
          <h2 className="h-d" style={{ fontSize: 44 }}>Sign in to <em style={{ color: "var(--accent)" }}>Queer Guide</em></h2>
        </div>
        <div className="grid" style={{ gap: 10 }}>
          <Field label="Email" value="alex@example.com" />
          <Field label="Password" value="••••••••••" right="Forgot?" />
        </div>
        <button className="btn btn--accent" style={{ height: 44, justifyContent: "center" }}>Sign in →</button>
        <div className="row" style={{ justifyContent: "center", color: "var(--muted)", fontSize: 12 }}>
          <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          <span>or continue with</span>
          <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {["Apple", "Google", "Email link"].map((p) => (
            <button key={p} className="btn btn--ghost" style={{ justifyContent: "center", height: 38 }}>{p}</button>
          ))}
        </div>
        <div style={{ marginTop: "auto", color: "var(--muted)", fontSize: 12 }}>
          New to Queer Guide? <span style={{ color: "var(--ink)", textDecoration: "underline" }}>Create an account</span>
        </div>
        <div style={{height:1,background:"var(--ink)",marginTop:14}} />
      </div>
    </div>
  );
}

function Field({ label, value, right }) {
  return (
    <label style={{ display: "block" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="lbl">{label}</span>
        {right && <span className="mono" style={{ color: "var(--muted)" }}>{right}</span>}
      </div>
      <div style={{ marginTop: 6, padding: "11px 12px", border: "1px solid var(--line-strong)", borderRadius: 3, background: "#fff", fontSize: 14 }}>{value}</div>
    </label>
  );
}

export function PatternSignUp() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", padding: 36, display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Logo />
        <div className="mono" style={{ color: "var(--muted)" }}>Step 2 of 4</div>
      </div>
      <div style={{height:1,background:"var(--ink)",marginTop:14}} />
      <div className="row" style={{ gap: 6 }}>
        {[1,2,3,4].map((i) => <div key={i} style={{ flex: 1, height: 3, background: i <= 2 ? "var(--accent)" : "var(--line)", borderRadius: 3 }} />)}
      </div>

      <div className="eyebrow">About you</div>
      <h2 className="h-d" style={{ fontSize: 38 }}>Tell us how you travel.</h2>
      <div style={{ color: "var(--muted)" }}>Helps us shape your feed. Skip anything that doesn't fit — you can change it later.</div>

      <div>
        <div className="lbl" style={{ marginBottom: 8 }}>I identify as…</div>
        <div className="row">
          {["Lesbian", "Gay", "Bi", "Trans", "Non-binary", "Queer", "Ally", "Prefer not to say"].map((t, i) => (
            <span key={t} className={i === 1 || i === 5 ? "pill pill--solid" : "pill"}>{t}</span>
          ))}
        </div>
      </div>

      <div>
        <div className="lbl" style={{ marginBottom: 8 }}>What I'm looking for</div>
        <div className="row">
          {["Nightlife", "Festivals", "Quiet getaways", "Food", "History", "Nature", "Wellness", "Family-friendly"].map((t, i) => (
            <span key={t} className={[0,2,4].includes(i) ? "pill pill--solid" : "pill"}>{t}</span>
          ))}
        </div>
      </div>

      <div>
        <div className="lbl" style={{ marginBottom: 8 }}>Home base</div>
        <div style={{ padding: "11px 12px", border: "1px solid var(--line-strong)", borderRadius: 3, background: "#fff", fontSize: 14 }}>Berlin, Germany</div>
      </div>

      <div className="row" style={{ marginTop: "auto", justifyContent: "space-between" }}>
        <button className="btn btn--ghost">← Back</button>
        <button className="btn btn--accent">Continue →</button>
      </div>
    </div>
  );
}

// ── 03 City ──────────────────────────────────────────────────────────────
export function PatternCity() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Cities" />
      <div className="ph" data-ph="Lisbon · panorama" style={{ height: 280, position: "relative" }}>
        <div style={{ position: "absolute", left: 40, bottom: 26, color: "#fff", textShadow: "0 2px 24px rgba(0,0,0,0.5)" }}>
          <div className="mono" style={{ opacity: 0.85, marginBottom: 6 }}>PORTUGAL · CAPITAL · IBERIA</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 80, lineHeight: 0.95 }}>Lisbon</div>
          <div style={{ marginTop: 8, opacity: 0.9, maxWidth: 540 }}>Hill-stacked, sun-soaked, with one of Europe's most welcoming queer scenes — Príncipe Real by day, Bairro Alto by night.</div>
        </div>
        <div style={{ position: "absolute", right: 30, bottom: 26, display: "flex", gap: 8 }}>
          <span className="pill pill--solid">⭐ 4.8 · 12k reviews</span>
          <span className="pill pill--accent">Pride · Jun 21</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 0, flex: 1 }}>
        <div style={{ borderRight: "1px solid var(--line)", padding: 22, fontSize: 13 }}>
          <div className="lbl" style={{ marginBottom: 10 }}>Jump to</div>
          {["Overview", "Venues", "Events", "Hotels", "Map", "Tips", "Community", "Weather"].map((s, i) => (
            <div key={s} style={{ padding: "7px 0", color: i === 1 ? "var(--accent)" : "var(--ink-2)", fontWeight: i === 1 ? 500 : 400, borderLeft: i === 1 ? "2px solid var(--accent)" : "2px solid transparent", paddingLeft: 10, marginLeft: -10 }}>{s}</div>
          ))}
          <hr />
          <div className="lbl" style={{ marginBottom: 8 }}>Right now</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 36 }}>23°</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Clear<br />Light NW wind</div>
          </div>
          <div className="badge badge--dot">132 venues open</div>
        </div>
        <div style={{ padding: 28 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <h2 className="h-d" style={{ fontSize: 36 }}>Venues in Lisbon</h2>
            <div className="row">
              <span className="pill">All 412</span>
              <span className="pill">Bars 88</span>
              <span className="pill">Clubs 24</span>
              <span className="pill">Cafés 64</span>
              <span className="pill">Saunas 12</span>
            </div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {[
              ["Trumps", "Pink Street", "Club", "★ 4.7"],
              ["Finalmente", "Príncipe Real", "Drag", "★ 4.9"],
              ["Bar 106", "Bairro Alto", "Bar", "★ 4.6"],
              ["Construction", "Cais do Sodré", "Club", "★ 4.5"],
              ["Side", "Príncipe Real", "Bar", "★ 4.8"],
              ["Purex", "Bairro Alto", "Lesbian bar", "★ 4.9"],
            ].map(([n, area, type, rating]) => (
              <div key={n} className="card" style={{ overflow: "hidden" }}>
                <div className="ph" style={{ height: 120 }} data-ph={n} />
                <div style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 500 }}>{n}</div>
                    <div className="mono" style={{ color: "var(--accent)" }}>{rating}</div>
                  </div>
                  <div className="mono" style={{ color: "var(--muted)", marginTop: 4 }}>{area} · {type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ── 04 Venues ────────────────────────────────────────────────────────────
function FilterBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 28px", borderBottom: "1px solid var(--line)", overflow: "hidden" }}>
      <span className="lbl">Filter</span>
      {[
        ["Type ▾", false], ["Open now", true], ["Lesbian-owned", false], ["Trans-friendly", true],
        ["Wheelchair", false], ["Outdoor", false], ["DJ tonight", false], ["Price ▾", false],
      ].map(([t, on]) => <span key={t} className={on ? "pill pill--solid" : "pill"}>{t}</span>)}
      <span style={{ marginLeft: "auto", color: "var(--muted)" }} className="mono">412 results · sort: relevance ▾</span>
    </div>
  );
}

export function PatternVenueList() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Discover" />
      <div style={{ padding: "20px 28px 12px" }}>
        <div className="eyebrow">Venues · Lisbon</div>
        <h2 className="h-d" style={{ fontSize: 42, margin: "6px 0 0" }}>412 places that earn their rainbow.</h2>
      </div>
      <FilterBar />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", flex: 1, minHeight: 0 }}>
        <div style={{ overflow: "hidden", padding: "20px 28px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, alignContent: "start" }}>
          {Array.from({ length: 6 }).map((_, i) => {
            const v = [
              ["Trumps", "Club · Pink Street", "★ 4.7", "€€"],
              ["Finalmente", "Drag · Príncipe Real", "★ 4.9", "€€€"],
              ["Bar 106", "Bar · Bairro Alto", "★ 4.6", "€"],
              ["Construction", "Club · Cais do Sodré", "★ 4.5", "€€"],
              ["Side", "Bar · Príncipe Real", "★ 4.8", "€€"],
              ["Purex", "Lesbian bar · Bairro Alto", "★ 4.9", "€"],
            ][i];
            return (
              <div key={i} className="card" style={{ display: "flex", overflow: "hidden" }}>
                <div className="ph" style={{ width: 130, flexShrink: 0 }} data-ph={v[0]} />
                <div style={{ padding: 14, flex: 1 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 500, fontSize: 15 }}>{v[0]}</div>
                    <span className="badge">{v[3]}</span>
                  </div>
                  <div className="mono" style={{ color: "var(--muted)", marginTop: 4 }}>{v[1]}</div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <span className="badge badge--dot">Open · until 04:00</span>
                    <span style={{ color: "var(--accent)", fontSize: 12 }}>{v[2]}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="ph" data-ph="map · cluster pins" style={{ borderLeft: "1px solid var(--line)" }} />
      </div>
    </div>
  );
}

export function PatternVenueDetail() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "auto" }}>
      <TopNav active="Discover" />
      <div style={{ padding: "16px 28px 4px", color: "var(--muted)", fontSize: 12 }}>
        Discover · Lisbon · Venues · <span style={{ color: "var(--ink)" }}>Finalmente Club</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, padding: "12px 28px" }}>
        <div className="ph" data-ph="hero photo" style={{ height: 320 }} />
        <div className="grid" style={{ gridTemplateRows: "1fr 1fr", gap: 8 }}>
          <div className="ph" data-ph="drag stage" style={{ height: 156 }} />
          <div className="ph" data-ph="dance floor" style={{ height: 156 }} />
        </div>
        <div className="grid" style={{ gridTemplateRows: "1fr 1fr", gap: 8 }}>
          <div className="ph" data-ph="bar" style={{ height: 156 }} />
          <div className="ph" data-ph="+18 more" style={{ height: 156 }} />
        </div>
      </div>
      <div style={{ padding: "8px 28px 24px", display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 28 }}>
        <div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="eyebrow">Drag · Cabaret · Late</div>
              <h2 className="h-d" style={{ fontSize: 56, margin: "6px 0 0" }}>Finalmente Club</h2>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--accent)" }}>★ 4.9</div>
              <div className="mono" style={{ color: "var(--muted)" }}>1,284 reviews</div>
            </div>
          </div>
          <hr />
          <div style={{ color: "var(--ink-2)", maxWidth: 600 }}>An institution since 1976 — drag every night, dance floor opens at 02:00. Príncipe Real local crowd, slowly turning international.</div>
          <div className="row" style={{ marginTop: 14 }}>
            {["Drag", "Late night", "Tourist-friendly", "Cash & card", "Smoking room"].map((t) => <span key={t} className="pill">{t}</span>)}
          </div>
          <hr />
          <div className="lbl" style={{ marginBottom: 10 }}>This week</div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => (
              <div key={d} className="card" style={{ padding: 10, textAlign: "center", background: i === 4 ? "var(--accent)" : "#fff", color: i === 4 ? "#fff" : "var(--ink)" }}>
                <div className="mono" style={{ fontSize: 10, opacity: 0.7 }}>{d}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>{18 + i}</div>
                <div style={{ fontSize: 10 }}>{i === 4 ? "Drag · 23h" : i === 5 ? "DJ · 02h" : "Open"}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="card" style={{ padding: 16 }}>
            <div className="lbl">Tonight</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 32, marginTop: 4 }}>Open · 23:00 — 06:00</div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="badge badge--dot">Cover €10</span>
              <span className="badge">Drag at 00:30</span>
            </div>
            <button className="btn btn--accent" style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>Add to plan</button>
            <button className="btn btn--ghost" style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>Share</button>
          </div>
          <div className="card" style={{ padding: 16, marginTop: 12 }}>
            <div className="lbl">Address</div>
            <div style={{ marginTop: 4 }}>R. Palmeira 38, 1200-313 Lisboa</div>
            <div className="ph" style={{ height: 110, marginTop: 10 }} data-ph="mini map" />
            <div className="row" style={{ marginTop: 10 }}>
              <span className="pill">📞 Call</span>
              <span className="pill">↗ Directions</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 05 Events ────────────────────────────────────────────────────────────
export function PatternEvents() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Events" />
      <div style={{ padding: "20px 28px 8px" }}>
        <div className="eyebrow">Events · this season</div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <h2 className="h-d" style={{ fontSize: 48 }}>Festivals, parties & parades.</h2>
          <div className="row">
            <span className="pill pill--solid">Calendar</span>
            <span className="pill">Map</span>
            <span className="pill">List</span>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", flex: 1, minHeight: 0 }}>
        <div style={{ borderRight: "1px solid var(--line)", padding: 22, fontSize: 13 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>Type</div>
          {["Pride", "Drag", "Music", "Film", "Sports", "Wellness", "Conferences"].map((t, i) => (
            <label key={t} style={{ display: "flex", gap: 8, padding: "5px 0", color: "var(--ink-2)" }}>
              <span style={{ width: 14, height: 14, border: "1px solid var(--line-strong)", borderRadius: 3, background: i < 3 ? "var(--ink)" : "transparent" }} />
              <span>{t}</span>
              <span style={{ marginLeft: "auto", color: "var(--muted)" }}>{[42, 18, 64, 12, 8, 6, 4][i]}</span>
            </label>
          ))}
          <hr />
          <div className="lbl" style={{ marginBottom: 8 }}>When</div>
          <div className="ph" style={{ height: 180 }} data-ph="month picker · June 2026" />
          <hr />
          <div className="lbl">Where</div>
          <div style={{ marginTop: 6, color: "var(--ink-2)" }}>Europe · 64 cities</div>
        </div>
        <div style={{ padding: 24, overflow: "hidden" }}>
          <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 0 }}>
            {Array.from({ length: 28 }).map((_, i) => {
              const events = [[3, "Pride Madrid"], [5, "Tel Aviv Pride"], [10, "Lisbon Pride"], [14, "Drag Bingo"], [18, "Athens Pride"], [22, "Pop Open Air"], [25, "Mýkonos XLSIOR"]];
              const ev = events.find(([d]) => d === i);
              return (
                <div key={i} style={{ borderTop: "1px solid var(--line)", borderRight: i % 7 === 6 ? "none" : "1px solid var(--line)", padding: 8, minHeight: 86 }}>
                  <div className="mono" style={{ color: "var(--muted)" }}>{i + 1}</div>
                  {ev && (
                    <div style={{ marginTop: 6, padding: 6, background: i % 4 === 0 ? "var(--c2)" : i % 4 === 1 ? "var(--c4)" : i % 4 === 2 ? "var(--c6)" : "var(--accent)", color: "#fff", borderRadius: 5, fontSize: 10, lineHeight: 1.2 }}>{ev[1]}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PatternFestival() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Events" />
      <div style={{ position: "relative", height: 360 }}>
        <div className="ph" data-ph="Pride 2026 · key art" style={{ height: "100%" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 30%,rgba(0,0,0,0.7))" }} />
        <div style={{ position: "absolute", left: 40, bottom: 30, color: "#fff" }}>
          <div className="mono" style={{ opacity: 0.85 }}>FESTIVAL · LISBON · JUN 21–28, 2026</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 88, lineHeight: 0.95 }}>Lisbon Pride <em style={{ color: "var(--c2)" }}>'26</em></div>
          <div style={{ marginTop: 10, maxWidth: 600 }}>A week of parades, performances, and parties — anchored by the Avenida da Liberdade march on the 28th.</div>
        </div>
        <div style={{ position: "absolute", right: 40, bottom: 30, display: "flex", gap: 8 }}>
          <span className="pill pill--accent">Free</span>
          <span className="pill pill--solid">142 events</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24, padding: "24px 28px" }}>
        <div>
          <div className="lbl">Programme</div>
          <hr style={{ marginTop: 4 }} />
          {[
            ["Sat 21", "Opening — Príncipe Real", "Free · all day"],
            ["Sun 22", "Drag picnic", "Jardim da Estrela · 14:00"],
            ["Mon 23", "Queer cinema week", "Cinema Ideal · €5"],
            ["Wed 25", "Trans rights forum", "Centro Cultural · 18:00"],
            ["Fri 27", "Pop Open Air", "Doca de Alcântara · 21:00"],
            ["Sat 28", "Parade · main march", "Avenida da Liberdade · 16:00"],
          ].map(([d, t, sub], i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr auto", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
              <div className="mono" style={{ color: "var(--accent)" }}>{d}</div>
              <div>
                <div style={{ fontWeight: 500 }}>{t}</div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{sub}</div>
              </div>
              <span className="pill">+ Save</span>
            </div>
          ))}
        </div>
        <div>
          <div className="card" style={{ padding: 18 }}>
            <div className="lbl">Going</div>
            <div className="row" style={{ marginTop: 10 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} style={{ width: 28, height: 28, borderRadius: 2, border: "2px solid #fff", marginLeft: i ? -8 : 0, background: ["var(--c1)", "var(--c2)", "var(--c4)", "var(--c6)", "var(--ink)"][i] }} />
              ))}
              <span style={{ marginLeft: 8, color: "var(--muted)", fontSize: 13 }}>4,218 going · 1,902 maybe</span>
            </div>
            <button className="btn btn--accent" style={{ width: "100%", marginTop: 16, justifyContent: "center" }}>I'm going →</button>
            <button className="btn btn--ghost" style={{ width: "100%", marginTop: 8, justifyContent: "center" }}>Share with friends</button>
          </div>
          <div className="card" style={{ padding: 18, marginTop: 12 }}>
            <div className="lbl">Stay</div>
            <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 12 }}>Festival hotels with pride rates</div>
            <div className="grid" style={{ marginTop: 10, gap: 8 }}>
              {[["Bairro Alto Hotel", "€220", "0.4 km"], ["The Lumiares", "€185", "0.6 km"], ["Casa Balthazar", "€140", "0.9 km"]].map(([n, p, dist]) => (
                <div key={n} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{n}</div>
                    <div className="mono" style={{ color: "var(--muted)" }}>{dist}</div>
                  </div>
                  <div style={{ color: "var(--accent)", fontFamily: "var(--font-display)", fontSize: 22 }}>{p}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 06 Hotels ────────────────────────────────────────────────────────────
export function PatternHotelSearch() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Hotels" />
      <div style={{ padding: "20px 28px", borderBottom: "1px solid var(--line)" }}>
        <div className="eyebrow">Hotel search</div>
        <h2 className="h-d" style={{ fontSize: 42, margin: "6px 0 14px" }}>Stays where you can be loud about it.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr auto", gap: 8, padding: 6, border: "1px solid var(--line-strong)", borderRadius: 4, background: "#fff" }}>
          {[["Where", "Lisbon, Portugal"], ["Check in", "Jun 21"], ["Check out", "Jun 28"], ["Guests", "2 adults"]].map(([l, v]) => (
            <div key={l} style={{ padding: 10 }}>
              <div className="lbl">{l}</div>
              <div style={{ marginTop: 2, fontSize: 14 }}>{v}</div>
            </div>
          ))}
          <button className="btn btn--accent" style={{ alignSelf: "stretch", padding: "0 22px" }}>Search</button>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          {["Pride-friendly", "Adults only", "Pool", "Spa", "Central", "Pet-friendly", "€100–250", "★ 4.5+"].map((t, i) => (
            <span key={t} className={i < 2 ? "pill pill--solid" : "pill"}>{t}</span>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 480px", flex: 1, minHeight: 0 }}>
        <div style={{ overflow: "hidden", padding: "16px 28px", display: "grid", gap: 12, alignContent: "start" }}>
          {[
            ["The Lumiares", "Bairro Alto", "€185", "★ 4.7", "Pride rate · 7 nights"],
            ["Bairro Alto Hotel", "Chiado", "€220", "★ 4.8", "Free queer city tour"],
            ["Casa Balthazar", "Príncipe Real", "€140", "★ 4.6", "Adults only · pool"],
            ["Memmo Príncipe Real", "Príncipe Real", "€260", "★ 4.9", "Sunset terrace"],
          ].map(([n, area, p, r, perk], i) => (
            <div key={i} className="card" style={{ display: "grid", gridTemplateColumns: "200px 1fr auto", overflow: "hidden" }}>
              <div className="ph" data-ph={n} style={{ height: 130 }} />
              <div style={{ padding: 14 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 500, fontSize: 16 }}>{n}</div>
                  <span style={{ color: "var(--accent)" }}>{r}</span>
                </div>
                <div className="mono" style={{ color: "var(--muted)", marginTop: 4 }}>{area}</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="badge badge--dot">{perk}</span>
                  <span className="badge">Pool</span>
                  <span className="badge">Breakfast</span>
                </div>
              </div>
              <div style={{ padding: 14, borderLeft: "1px solid var(--line)", textAlign: "right", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div className="mono" style={{ color: "var(--muted)" }}>per night</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--accent)" }}>{p}</div>
                </div>
                <button className="btn">View →</button>
              </div>
            </div>
          ))}
        </div>
        <div className="ph" data-ph="hotel map" style={{ borderLeft: "1px solid var(--line)" }} />
      </div>
    </div>
  );
}

export function PatternHotelDetail() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopNav active="Hotels" />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 6, padding: "12px 28px" }}>
        <div className="ph" data-ph="lobby · pool" style={{ height: 360 }} />
        <div className="grid" style={{ gridTemplateRows: "1fr 1fr", gap: 6 }}>
          <div className="ph" data-ph="suite" style={{ height: 178 }} />
          <div className="ph" data-ph="bath" style={{ height: 178 }} />
        </div>
        <div className="grid" style={{ gridTemplateRows: "1fr 1fr", gap: 6 }}>
          <div className="ph" data-ph="terrace" style={{ height: 178 }} />
          <div className="ph" data-ph="+24 photos" style={{ height: 178 }} />
        </div>
      </div>
      <div style={{ padding: "10px 28px 24px", display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 28, flex: 1, minHeight: 0, overflow: "hidden" }}>
        <div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="eyebrow">Boutique · Bairro Alto</div>
              <h2 className="h-d" style={{ fontSize: 52, margin: "6px 0 0" }}>The Lumiares</h2>
              <div style={{ color: "var(--muted)", marginTop: 6 }}>Rua do Diário de Notícias 142, Lisbon</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="mono" style={{ color: "var(--muted)" }}>per night from</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 48, color: "var(--accent)" }}>€185</div>
              <span className="badge">Pride rate</span>
            </div>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            {["Pool", "Spa", "Bar", "Pride-friendly", "Pet-friendly", "Free WiFi", "Breakfast", "Terrace"].map((t) => <span key={t} className="pill">{t}</span>)}
          </div>
          <hr />
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {[["★ 4.7", "986 reviews"], ["98%", "would book again"], ["EU+", "Pride-rated host"]].map(([big, sub]) => (
              <div key={big}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 32 }}>{big}</div>
                <div className="mono" style={{ color: "var(--muted)" }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 18, alignSelf: "start" }}>
          <div className="lbl">Your stay</div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div style={{ padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}><div className="mono" style={{ color: "var(--muted)" }}>Check in</div><div>Jun 21</div></div>
            <div style={{ padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}><div className="mono" style={{ color: "var(--muted)" }}>Check out</div><div>Jun 28</div></div>
          </div>
          <div style={{ padding: 10, border: "1px solid var(--line)", borderRadius: 8, marginTop: 8 }}>
            <div className="mono" style={{ color: "var(--muted)" }}>Guests</div><div>2 adults · 1 room</div>
          </div>
          <hr />
          <div className="row" style={{ justifyContent: "space-between" }}><span>7 nights</span><span>€1,295</span></div>
          <div className="row" style={{ justifyContent: "space-between", color: "var(--muted)" }}><span>Pride rate −10%</span><span>−€129</span></div>
          <div className="row" style={{ justifyContent: "space-between" }}><span>Tax & fees</span><span>€86</span></div>
          <hr />
          <div className="row" style={{ justifyContent: "space-between", fontFamily: "var(--font-display)", fontSize: 26 }}>
            <span>Total</span><span style={{ color: "var(--accent)" }}>€1,252</span>
          </div>
          <button className="btn btn--accent" style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>Reserve →</button>
        </div>
      </div>
    </div>
  );
}

export function PatternTravelDeals() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Hotels" />
      <div style={{ padding: "20px 28px" }}>
        <div className="eyebrow">Travel · this week</div>
        <h2 className="h-d" style={{ fontSize: 42 }}>Flights, packages & festival deals.</h2>
      </div>
      <div style={{ padding: "0 28px 14px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          ["Berlin → Lisbon", "Pride week", "€89", "Eurowings"],
          ["NYC → Mykonos", "Aug XLSIOR", "€420", "Delta"],
          ["London → Madrid", "MADO Pride", "€64", "easyJet"],
          ["Paris → Tel Aviv", "TLV Pride", "€158", "Transavia"],
        ].map(([r, e, p, c], i) => (
          <div key={i} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="lbl">{e}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1.05 }}>{r}</div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: "auto", alignItems: "baseline" }}>
              <span className="mono" style={{ color: "var(--muted)" }}>{c}</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--accent)" }}>{p}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 28px", borderTop: "1px solid var(--line)", flex: 1 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="h-d" style={{ fontSize: 28 }}>Curated packages</h3>
          <span className="mono" style={{ color: "var(--muted)" }}>14 deals</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 12 }}>
          {[
            ["Lisbon Pride Week", "Flight + 4★ stay + parade pass", "€480", "var(--c2)"],
            ["Mykonos August", "Flight + boutique hotel + boat", "€940", "var(--c4)"],
            ["Berlin CSD long weekend", "Flight + central stay + tour", "€320", "var(--c6)"],
          ].map(([t, sub, p, c]) => (
            <div key={t} className="card" style={{ overflow: "hidden" }}>
              <div className="ph" style={{ height: 140, background: c }} data-ph={t} />
              <div style={{ padding: 14 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>{t}</div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{sub}</div>
                <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
                  <span className="badge">From</span>
                  <span style={{ color: "var(--accent)", fontFamily: "var(--font-display)", fontSize: 24 }}>{p}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 07 Map ───────────────────────────────────────────────────────────────
export function PatternMap() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Discover" />
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", flex: 1, minHeight: 0 }}>
        <div style={{ borderRight: "1px solid var(--line)", padding: 22, overflow: "hidden" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Lisbon · 412 places</div>
          <div style={{ padding: "10px 12px", border: "1px solid var(--line-strong)", borderRadius: 2, fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>⌕ Search this area</div>
          <div className="row" style={{ marginBottom: 12 }}>
            {["All", "Bars", "Clubs", "Saunas", "Cafés", "Sights"].map((t, i) => <span key={t} className={i === 0 ? "pill pill--solid" : "pill"}>{t}</span>)}
          </div>
          <div className="grid" style={{ gap: 10 }}>
            {[
              ["Trumps", "Club", "★ 4.7", "var(--c1)"],
              ["Finalmente", "Drag", "★ 4.9", "var(--c2)"],
              ["Bar 106", "Bar", "★ 4.6", "var(--c4)"],
              ["Construction", "Club", "★ 4.5", "var(--c6)"],
            ].map(([n, t, r, c]) => (
              <div key={n} className="card" style={{ padding: 12, display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 10, alignItems: "center" }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: c }} />
                <div>
                  <div style={{ fontWeight: 500 }}>{n}</div>
                  <div className="mono" style={{ color: "var(--muted)" }}>{t}</div>
                </div>
                <span style={{ color: "var(--accent)", fontSize: 12 }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: "relative" }} className="ph" data-ph="map · Lisbon">
          <div style={{ position: "absolute", left: 22, top: 22, display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="pill pill--solid" style={{ background: "#fff", color: "var(--ink)" }}>Pride districts</span>
            <span className="pill" style={{ background: "#fff" }}>Open now</span>
          </div>
          {[
            [38, 32, "var(--c1)", 12], [55, 42, "var(--c2)", 8], [62, 28, "var(--c4)", 4],
            [42, 58, "var(--c6)", 6], [70, 52, "var(--accent)", 22], [30, 70, "var(--c3)", 3],
          ].map(([x, y, c, n], i) => (
            <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)", width: 36, height: 36, borderRadius: 2, background: c, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, boxShadow: "0 4px 16px rgba(0,0,0,0.25)", fontSize: 12 }}>{n}</div>
          ))}
          <div style={{ position: "absolute", right: 22, bottom: 22, padding: 10, background: "#fff", borderRadius: 3, fontSize: 12 }}>
            <div className="lbl" style={{ marginBottom: 6 }}>Density</div>
            <div className="row" style={{ gap: 6 }}>
              <span style={{ width: 14, height: 14, background: "var(--c3)", borderRadius: 3 }}></span>
              <span style={{ width: 14, height: 14, background: "var(--c2)", borderRadius: 3 }}></span>
              <span style={{ width: 14, height: 14, background: "var(--c1)", borderRadius: 3 }}></span>
              <span style={{ width: 14, height: 14, background: "var(--accent)", borderRadius: 3 }}></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 08 Villages ──────────────────────────────────────────────────────────
export function PatternVillages() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Discover" />
      <div style={{ padding: "26px 28px 16px" }}>
        <div className="eyebrow">Queer villages & neighbourhoods</div>
        <h2 className="h-d" style={{ fontSize: 48, marginTop: 6 }}>Where the community lives — block by block.</h2>
        <div style={{ color: "var(--muted)", maxWidth: 620, marginTop: 8 }}>From Le Marais to Boystown, Chueca to Schöneberg — historic queer districts mapped, indexed, and lived-in.</div>
      </div>
      <div style={{ padding: "0 28px 24px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {[
          ["Schöneberg", "Berlin", "Since 1920s", "var(--c1)"],
          ["Chueca", "Madrid", "Since 1980s", "var(--c2)"],
          ["Le Marais", "Paris", "Since 1980s", "var(--c3)"],
          ["Castro", "San Francisco", "Since 1960s", "var(--c4)"],
          ["Boystown", "Chicago", "Since 1970s", "var(--c6)"],
          ["Gaixample", "Barcelona", "Since 1990s", "var(--accent)"],
          ["Soho", "London", "Since 1950s", "var(--c1)"],
          ["Davie Village", "Vancouver", "Since 1970s", "var(--c4)"],
        ].map(([n, c, era, color], i) => (
          <div key={i} className="card" style={{ overflow: "hidden", borderTop: `4px solid ${color}` }}>
            <div className="ph" style={{ height: 140 }} data-ph={`${n} street`} />
            <div style={{ padding: 14 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 26 }}>{n}</div>
              <div className="mono" style={{ color: "var(--muted)", marginTop: 4 }}>{c} · {era}</div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="badge">{[42, 38, 56, 88, 64, 72, 96, 32][i]} venues</span>
                <span className="badge">Pride flag</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PatternVillageDetail() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopNav active="Discover" />
      <div style={{ padding: "20px 28px 8px" }}>
        <div className="eyebrow">Berlin · neighbourhood</div>
        <h2 className="h-d" style={{ fontSize: 70, lineHeight: 0.95, marginTop: 4 }}>Schöneberg.</h2>
        <div style={{ color: "var(--muted)", marginTop: 10, maxWidth: 600 }}>Berlin's first queer district — Bowie's Hauptstraße address, the Eldorado of the Weimar years, Motzstraße street parties.</div>
      </div>
      <div style={{ padding: "12px 28px", display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24, flex: 1, minHeight: 0 }}>
        <div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div className="ph" style={{ height: 220 }} data-ph="Motzstraße" />
            <div className="grid" style={{ gridTemplateRows: "1fr 1fr", gap: 10 }}>
              <div className="ph" data-ph="Café Berio" />
              <div className="ph" data-ph="Eldorado" />
            </div>
            <div className="grid" style={{ gridTemplateRows: "1fr 1fr", gap: 10 }}>
              <div className="ph" data-ph="Pride memorial" />
              <div className="ph" data-ph="Hafen" />
            </div>
          </div>
          <hr />
          <div className="lbl">Defining places</div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 10 }}>
            {[
              ["Hafen", "Bar · since 1992"],
              ["Tom's Bar", "Cruising · since 1981"],
              ["SchwuZ", "Club · 1977"],
              ["Café Berio", "Café · 1975"],
              ["Schwules Museum", "Museum"],
              ["Begine", "Lesbian space"],
            ].map(([n, sub]) => (
              <div key={n} className="card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 500 }}>{n}</div>
                <div className="mono" style={{ color: "var(--muted)", marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="card" style={{ padding: 16 }}>
            <div className="lbl">A short history</div>
            <p style={{ marginTop: 8, color: "var(--ink-2)" }}>
              By 1925 Schöneberg housed dozens of cabarets and bars, including the Eldorado on Motzstraße. The Nazi regime closed them in 1933. Reopened informally through the 1950s, the district was officially queer-coded again by the early 70s.
            </p>
            <p style={{ marginTop: 8, color: "var(--ink-2)" }}>
              The Motzstraßenfest, since 1993, draws 350,000 every July.
            </p>
          </div>
          <div className="card" style={{ padding: 16, marginTop: 12 }}>
            <div className="lbl">Walking tour</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 4 }}>2.4 km · 7 stops · 90 min</div>
            <button className="btn btn--accent" style={{ width: "100%", marginTop: 10, justifyContent: "center" }}>Start audio tour</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 09 Groups & messaging ────────────────────────────────────────────────
export function PatternGroups() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Groups" />
      <div style={{ padding: "20px 28px 4px" }}>
        <div className="eyebrow">Community groups</div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="h-d" style={{ fontSize: 44 }}>Find your people, by the place or by the thing.</h2>
          <button className="btn btn--accent">+ Start a group</button>
        </div>
      </div>
      <div className="row" style={{ padding: "10px 28px", borderBottom: "1px solid var(--line)" }}>
        {["Local", "Trans+", "Lesbian", "Bears", "Sport", "Faith", "Parents", "Youth", "Sober", "Trail running"].map((t, i) => <span key={t} className={i < 2 ? "pill pill--solid" : "pill"}>{t}</span>)}
      </div>
      <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, flex: 1 }}>
        {[
          ["Berlin Trans Brunch", "Berlin · trans+", 1284, "var(--c1)"],
          ["Lisbon Lesbian Hikers", "Lisbon · sport", 612, "var(--c4)"],
          ["Queer Parents NYC", "New York · family", 4218, "var(--c2)"],
          ["Bears of Madrid", "Madrid · bears", 894, "var(--c3)"],
          ["Sober Pride Worldwide", "Global · sober", 11400, "var(--c6)"],
          ["Trail Running Pride", "Global · sport", 502, "var(--accent)"],
        ].map(([n, sub, count, color], i) => (
          <div key={i} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 3, background: color }} />
            <div style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>{n}</div>
            <div className="mono" style={{ color: "var(--muted)" }}>{sub}</div>
            <div className="row" style={{ marginTop: "auto", justifyContent: "space-between" }}>
              <span className="mono" style={{ color: "var(--muted)" }}>{count.toLocaleString()} members</span>
              <span className="pill pill--solid">Join</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PatternGroupDetail() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopNav active="Groups" />
      <div className="ph" data-ph="group cover · Berlin Trans Brunch" style={{ height: 180 }} />
      <div style={{ padding: "16px 28px", borderBottom: "1px solid var(--line)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div className="eyebrow">Berlin · trans+ · since 2019</div>
            <h2 className="h-d" style={{ fontSize: 44, marginTop: 4 }}>Berlin Trans Brunch</h2>
            <div style={{ color: "var(--muted)", marginTop: 4 }}>1,284 members · 32 going to next event · public</div>
          </div>
          <div className="row">
            <span className="pill">Notifications</span>
            <button className="btn btn--accent">Joined ✓</button>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", flex: 1, minHeight: 0 }}>
        <div style={{ padding: 24, overflow: "hidden" }}>
          <div className="row" style={{ marginBottom: 14 }}>
            {["Feed", "Events", "Members", "About"].map((t, i) => (
              <span key={t} style={{ padding: "6px 14px", borderBottom: i === 0 ? "2px solid var(--accent)" : "2px solid transparent", color: i === 0 ? "var(--ink)" : "var(--muted)", fontWeight: i === 0 ? 500 : 400 }}>{t}</span>
            ))}
          </div>
          <div className="card" style={{ padding: 14, marginBottom: 14 }}>
            <div className="row">
              <div style={{ width: 32, height: 32, borderRadius: 2, background: "var(--c2)" }} />
              <div style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 2, color: "var(--muted)" }}>Share something with the group…</div>
              <span className="pill">📷</span>
              <span className="pill">Event</span>
            </div>
          </div>
          {[
            ["Mira", "2h", "Brunch this Sunday is at Silo Coffee — anyone want to claim a table for 6? Reply if you're in."],
            ["Jonas", "Yesterday", "Posting our July outing photos — it was perfect weather and 28 of us made it."],
            ["Halima", "2d", "Reminder: the city offers a free legal clinic for name change support every first Wednesday — link in pinned."],
          ].map(([who, when, body], i) => (
            <div key={i} className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 2, background: ["var(--c1)", "var(--c4)", "var(--c6)"][i] }} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{who}</div>
                  <div className="mono" style={{ color: "var(--muted)" }}>{when}</div>
                </div>
                <span style={{ marginLeft: "auto", color: "var(--muted)" }} className="mono">···</span>
              </div>
              <div style={{ color: "var(--ink-2)" }}>{body}</div>
              <div className="row" style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
                <span>♡ {[24, 86, 142][i]}</span><span>💬 {[8, 12, 4][i]}</span><span>↗ Share</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderLeft: "1px solid var(--line)", padding: 22 }}>
          <div className="lbl">Next event</div>
          <div className="card" style={{ padding: 14, marginTop: 8 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>Sunday brunch</div>
            <div className="mono" style={{ color: "var(--muted)" }}>Sun · 11:00 · Silo Coffee</div>
            <button className="btn btn--accent" style={{ width: "100%", marginTop: 10, justifyContent: "center" }}>I'm going</button>
          </div>
          <hr />
          <div className="lbl">Pinned</div>
          <div style={{ marginTop: 8, color: "var(--ink-2)", fontSize: 13 }}>📌 Group rules · 📌 Legal clinic dates · 📌 Welcome thread</div>
          <hr />
          <div className="lbl">Members · 1,284</div>
          <div className="row" style={{ marginTop: 8 }}>
            {[0,1,2,3,4,5].map((i) => <div key={i} style={{ width: 28, height: 28, borderRadius: 2, marginLeft: i ? -8 : 0, border: "2px solid #fff", background: ["var(--c1)","var(--c2)","var(--c3)","var(--c4)","var(--c6)","var(--ink)"][i] }} />)}
            <span style={{ marginLeft: 8, color: "var(--muted)", fontSize: 12 }}>+1,278</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PatternMessaging() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Groups" />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 280px", flex: 1, minHeight: 0 }}>
        <div style={{ borderRight: "1px solid var(--line)", padding: 18, overflow: "hidden" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h3 className="h-d" style={{ fontSize: 26 }}>Messages</h3>
            <span className="pill">+ New</span>
          </div>
          <div style={{ padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 2, color: "var(--muted)", marginBottom: 12, fontSize: 13 }}>⌕ Search messages…</div>
          {[
            ["Mira", "See you Sunday!", "2m", true],
            ["Jonas", "Sent the photos", "1h", true],
            ["Bears of Madrid", "Welcome ❤︎", "4h", false],
            ["Halima", "Thanks for the link", "Yesterday", false],
            ["Trans Brunch", "Reminder: Sunday 11am", "2d", false],
          ].map(([n, p, t, online], i) => (
            <div key={i} className="row" style={{ padding: "10px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
              <div style={{ position: "relative" }}>
                <div style={{ width: 36, height: 36, borderRadius: 2, background: ["var(--c1)","var(--c2)","var(--c4)","var(--c6)","var(--accent)"][i] }} />
                {online && <div style={{ position: "absolute", right: -2, bottom: -2, width: 10, height: 10, borderRadius: 2, background: "#22c55e", border: "2px solid var(--paper)" }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{n}</span>
                  <span className="mono" style={{ color: "var(--muted)" }}>{t}</span>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="row" style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)", justifyContent: "space-between" }}>
            <div className="row">
              <div style={{ width: 36, height: 36, borderRadius: 2, background: "var(--c1)" }} />
              <div>
                <div style={{ fontWeight: 500 }}>Mira</div>
                <div className="mono" style={{ color: "#22c55e" }}>● online</div>
              </div>
            </div>
            <div className="row"><span className="pill">📞</span><span className="pill">···</span></div>
          </div>
          <div style={{ flex: 1, padding: 22, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden", background: "var(--paper-2)" }}>
            {[
              ["m","Hey! Are you coming to brunch on Sunday?", "11:02"],
              ["me","Yeah — Silo at 11?", "11:03"],
              ["m","Yes! I'll grab a table for 6, you can bring people.", "11:03"],
              ["me","Perfect. Bringing two friends visiting from Lisbon.", "11:04"],
              ["m","Oh nice! I'll save spots. See you Sunday ❤︎", "11:05"],
            ].map(([who, body, t], i) => (
              <div key={i} style={{ alignSelf: who === "me" ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                <div style={{ padding: "10px 14px", background: who === "me" ? "var(--accent)" : "#fff", color: who === "me" ? "#fff" : "var(--ink)", borderRadius: 16, borderTopRightRadius: who === "me" ? 4 : 16, borderTopLeftRadius: who === "me" ? 16 : 4 }}>{body}</div>
                <div className="mono" style={{ color: "var(--muted)", marginTop: 3, textAlign: who === "me" ? "right" : "left", fontSize: 10 }}>{t}</div>
              </div>
            ))}
          </div>
          <div className="row" style={{ padding: "14px 22px", borderTop: "1px solid var(--line)" }}>
            <span className="pill">+</span>
            <div style={{ flex: 1, padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 2, color: "var(--muted)" }}>Write a message…</div>
            <span className="pill pill--accent">Send →</span>
          </div>
        </div>
        <div style={{ borderLeft: "1px solid var(--line)", padding: 22 }}>
          <div style={{ width: 64, height: 64, borderRadius: 2, background: "var(--c1)", margin: "0 auto" }} />
          <div style={{ textAlign: "center", marginTop: 10, fontFamily: "var(--font-display)", fontSize: 22 }}>Mira K.</div>
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12 }}>Berlin · Trans Brunch host</div>
          <hr />
          <div className="lbl">Shared</div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginTop: 8 }}>
            {[0,1,2,3,4,5].map((i) => <div key={i} className="ph" style={{ aspectRatio: 1 }} data-ph="" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 10 Content ───────────────────────────────────────────────────────────
export function PatternNews() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Discover" />
      <div style={{ padding: "26px 28px 16px" }}>
        <div className="eyebrow">News & dispatches</div>
        <h2 className="h-d" style={{ fontSize: 56, lineHeight: 0.95 }}>From the queer world,<br />slowly read.</h2>
      </div>
      <div style={{ padding: "0 28px 18px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 18 }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="ph" style={{ height: 280 }} data-ph="lead photo" />
          <div style={{ padding: 18 }}>
            <div className="mono" style={{ color: "var(--accent)", marginBottom: 6 }}>POLITICS · 8 MIN READ</div>
            <h3 className="h-d" style={{ fontSize: 32 }}>Inside Greece's quiet shift on same-sex adoption.</h3>
            <div style={{ color: "var(--muted)", marginTop: 8 }}>The 2024 reform passed without the protest predicted. A reporter spent six months on Crete to find out why.</div>
            <div className="mono" style={{ color: "var(--muted)", marginTop: 12 }}>By Paula Mantzouri · Mar 18</div>
          </div>
        </div>
        <div className="grid" style={{ gridAutoRows: "min-content", gap: 12 }}>
          {[
            ["Travel", "What changes for queer travelers in 2026"],
            ["Health", "Where PrEP is free, where it isn't"],
            ["Profile", "Madrid's drag elders speak"],
          ].map(([cat, t], i) => (
            <div key={i} className="card" style={{ padding: 14 }}>
              <div className="mono" style={{ color: "var(--accent)" }}>{cat.toUpperCase()}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 4, lineHeight: 1.1 }}>{t}</div>
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridAutoRows: "min-content", gap: 12 }}>
          {[
            ["Festival", "Lisbon Pride 2026: the full programme"],
            ["Opinion", "Why we still need queer bookshops"],
            ["History", "The Stonewall myth, gently corrected"],
          ].map(([cat, t], i) => (
            <div key={i} className="card" style={{ padding: 14 }}>
              <div className="mono" style={{ color: "var(--accent)" }}>{cat.toUpperCase()}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 4, lineHeight: 1.1 }}>{t}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PatternArticle() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "auto" }}>
      <TopNav active="Discover" />
      <div style={{ padding: "30px 28px 16px", maxWidth: 760, margin: "0 auto", width: "100%" }}>
        <div className="mono" style={{ color: "var(--accent)" }}>POLITICS · 8 MIN READ · MAR 18, 2026</div>
        <h1 className="h-d" style={{ fontSize: 64, lineHeight: 1.0, marginTop: 10 }}>Inside Greece's quiet shift on same-sex adoption.</h1>
        <div style={{ color: "var(--muted)", marginTop: 14, fontSize: 16 }}>The 2024 reform passed without the protest predicted. A reporter spent six months on Crete to find out why.</div>
        <div className="row" style={{ marginTop: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 2, background: "var(--c2)" }} />
          <div>
            <div style={{ fontWeight: 500 }}>Paula Mantzouri</div>
            <div className="mono" style={{ color: "var(--muted)" }}>Athens correspondent</div>
          </div>
          <div style={{ marginLeft: "auto" }} className="row">
            <span className="pill">Save</span>
            <span className="pill">Share</span>
          </div>
        </div>
      </div>
      <div className="ph" data-ph="lead photo · Heraklion harbour" style={{ height: 360, margin: "16px 28px" }} />
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 28px 40px", fontSize: 17, lineHeight: 1.6, color: "var(--ink-2)" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 28, lineHeight: 1.25, color: "var(--ink)", margin: 0 }}>
          On the morning the bill passed, the bakery on Daedalus Street was open as usual.
        </p>
        <p>Christina, 62, was wrapping pies. Her son had texted her at 02:00 — the vote had gone through, 176 to 76, in the small hours of a Thursday. By breakfast it was the second story on the morning news, after the football.</p>
        <p>"That's how it should be," she told me. "It should be small."</p>
        <hr />
        <p>The reform — Law 5089/2024 — does three things at once. It legalises civil marriage, allows joint adoption by same-sex couples, and recognises foreign marriages and parental relationships. It is the most decisive change to Greek family law since 1983.</p>
        <p>But to call it the result of a movement is, at least locally, a stretch. There were no mass mobilisations in Heraklion. There was no public counter-mobilisation either.</p>
      </div>
    </div>
  );
}

export function PatternPersonalities() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Discover" />
      <div style={{ padding: "26px 28px 14px" }}>
        <div className="eyebrow">Personalities</div>
        <h2 className="h-d" style={{ fontSize: 48, marginTop: 4 }}>Voices to read, watch, follow.</h2>
      </div>
      <div style={{ padding: "0 28px 24px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, flex: 1 }}>
        {[
          ["RuPaul Charles", "Drag · Host", "var(--c1)"],
          ["Laverne Cox", "Actor · Activist", "var(--c4)"],
          ["Pedro Almodóvar", "Director", "var(--c2)"],
          ["Hannah Gadsby", "Comedian", "var(--c6)"],
          ["Lil Nas X", "Music", "var(--accent)"],
          ["Janelle Monáe", "Music", "var(--c4)"],
          ["Phia Ménard", "Performance", "var(--c3)"],
          ["Édouard Louis", "Author", "var(--c1)"],
        ].map(([n, role, color], i) => (
          <div key={i} className="card" style={{ overflow: "hidden" }}>
            <div className="ph" style={{ height: 200, background: color }} data-ph={n} />
            <div style={{ padding: 14 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 24, lineHeight: 1.05 }}>{n}</div>
              <div className="mono" style={{ color: "var(--muted)", marginTop: 4 }}>{role}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PatternResources() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Resources" />
      <div style={{ padding: "26px 28px 14px" }}>
        <div className="eyebrow">Resources directory</div>
        <h2 className="h-d" style={{ fontSize: 44 }}>Help, hotlines, and good lawyers — by city.</h2>
      </div>
      <div className="row" style={{ padding: "10px 28px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
        {["Mental health", "Legal aid", "Trans care", "HIV/PrEP", "Housing", "Asylum", "Youth", "Sport", "Faith", "Sober"].map((t, i) => (
          <span key={t} className={i < 3 ? "pill pill--solid" : "pill"}>{t}</span>
        ))}
      </div>
      <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {[
          ["The Trevor Project", "Mental health · Global", "1-866-488-7386 · 24/7", "var(--c1)"],
          ["Mermaids", "Trans youth · UK", "0808 801 0400", "var(--c2)"],
          ["Rede Ex Aequo", "LGBTQ youth · PT", "+351 220 308 644", "var(--c3)"],
          ["AIDS-Hilfe", "HIV · DE", "030 690 087-0", "var(--c4)"],
          ["Stop Sida", "HIV/PrEP · ES", "+34 933 175 247", "var(--c6)"],
          ["IGLYO", "Youth · Europe", "info@iglyo.com", "var(--accent)"],
        ].map(([n, type, contact, color], i) => (
          <div key={i} className="card" style={{ padding: 16, display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 3, background: color }} />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>{n}</div>
              <div className="mono" style={{ color: "var(--muted)" }}>{type}</div>
              <div style={{ marginTop: 4, fontSize: 13 }}>{contact}</div>
            </div>
            <span className="pill pill--solid">Contact →</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 11 Marketplace ───────────────────────────────────────────────────────
export function PatternMarketplace() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Discover" />
      <div style={{ padding: "20px 28px 8px" }}>
        <div className="eyebrow">Marketplace · queer-owned</div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="h-d" style={{ fontSize: 44 }}>Goods, services, & local makers.</h2>
          <button className="btn btn--accent">+ List something</button>
        </div>
      </div>
      <div className="row" style={{ padding: "10px 28px", borderBottom: "1px solid var(--line)" }}>
        {["All", "Apparel", "Art", "Books", "Home", "Tours", "Lessons", "Stays", "Services"].map((t, i) => (
          <span key={t} className={i === 0 ? "pill pill--solid" : "pill"}>{t}</span>
        ))}
        <span style={{ marginLeft: "auto", color: "var(--muted)" }} className="mono">2,140 listings · sort: newest ▾</span>
      </div>
      <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, flex: 1 }}>
        {[
          ["Hand-screened pride zine", "€18", "Lisbon · Aurora Press"],
          ["Drag history walking tour", "€32", "Berlin · 2h"],
          ["Embroidered jacket", "€220", "Madrid · Olé Studio"],
          ["Queer cinema poster set", "€48", "Paris · La Pellicule"],
          ["Trans-led pottery class", "€60", "London · Clay & Cake"],
          ["Self-defence workshop", "€25", "Athens · Fierce"],
          ["Photographer · couples", "from €180", "NYC · Sam J."],
          ["Pride flag (extra large)", "€38", "Manchester · MaCo"],
        ].map(([n, p, sub], i) => (
          <div key={i} className="card" style={{ overflow: "hidden" }}>
            <div className="ph" style={{ height: 150 }} data-ph={n} />
            <div style={{ padding: 12 }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{n}</div>
              <div className="mono" style={{ color: "var(--muted)", marginTop: 4 }}>{sub}</div>
              <div className="row" style={{ marginTop: 8, justifyContent: "space-between" }}>
                <span style={{ color: "var(--accent)", fontFamily: "var(--font-display)", fontSize: 22 }}>{p}</span>
                <span className="pill">♡</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PatternMarketDetail() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopNav active="Discover" />
      <div style={{ padding: "12px 28px", color: "var(--muted)", fontSize: 12 }}>Marketplace · Apparel · <span style={{ color: "var(--ink)" }}>Embroidered jacket</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", padding: "8px 28px 24px", gap: 28, flex: 1, minHeight: 0 }}>
        <div>
          <div className="ph" style={{ aspectRatio: "4/3", height: 460 }} data-ph="hero · jacket detail" />
          <div className="row" style={{ marginTop: 8, gap: 6 }}>
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="ph" style={{ width: 76, height: 60 }} data-ph={i ? `${i}` : "main"} />)}
          </div>
        </div>
        <div>
          <div className="eyebrow">Apparel · one of one</div>
          <h2 className="h-d" style={{ fontSize: 44, marginTop: 4 }}>Embroidered jacket</h2>
          <div className="row" style={{ marginTop: 8 }}>
            <span style={{ color: "var(--accent)" }}>★ 4.9</span>
            <span className="mono" style={{ color: "var(--muted)" }}>· 28 reviews · 142 sold</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 56, color: "var(--accent)", marginTop: 14 }}>€220</div>
          <hr />
          <div className="lbl">Size</div>
          <div className="row" style={{ marginTop: 6 }}>
            {["XS", "S", "M", "L", "XL"].map((s, i) => <span key={s} className={i === 2 ? "pill pill--solid" : "pill"}>{s}</span>)}
          </div>
          <div className="lbl" style={{ marginTop: 14 }}>Color</div>
          <div className="row" style={{ marginTop: 6 }}>
            {["#1a1814", "#d8533a", "#264653", "#f4a261"].map((c, i) => <span key={c} style={{ width: 32, height: 32, borderRadius: 2, background: c, border: i === 1 ? "2px solid var(--ink)" : "1px solid var(--line)" }} />)}
          </div>
          <button className="btn btn--accent" style={{ width: "100%", justifyContent: "center", height: 46, marginTop: 16 }}>Add to bag · €220</button>
          <button className="btn btn--ghost" style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>Message Olé Studio</button>
          <hr />
          <div className="row">
            <div style={{ width: 38, height: 38, borderRadius: 2, background: "var(--c2)" }} />
            <div>
              <div style={{ fontWeight: 500 }}>Olé Studio</div>
              <div className="mono" style={{ color: "var(--muted)" }}>Madrid · since 2018 · 1,840 sales</div>
            </div>
            <span style={{ marginLeft: "auto" }} className="pill">Visit shop</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 12 Search / Tags / Weather ───────────────────────────────────────────
export function PatternSearch() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Discover" />
      <div style={{ padding: "30px 28px 14px", maxWidth: 720, width: "100%", margin: "0 auto" }}>
        <div className="row" style={{ alignItems: "center", padding: "12px 18px", border: "1px solid var(--ink)", borderRadius: 4, background: "#fff", gap: 12 }}>
          <span style={{ fontSize: 18 }}>⌕</span>
          <span style={{ flex: 1, fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ink)" }}>queer bars in Lisbon</span>
          <span className="mono" style={{ color: "var(--muted)" }}>esc</span>
        </div>
      </div>
      <div style={{ padding: "0 28px", maxWidth: 720, width: "100%", margin: "0 auto" }}>
        <div className="row" style={{ marginBottom: 14, color: "var(--muted)" }}>
          <span className="mono">128 results across</span>
          {["Venues 88", "Events 12", "Cities 1", "Articles 4", "Groups 6"].map((t, i) => <span key={t} className={i === 0 ? "pill pill--solid" : "pill"}>{t}</span>)}
        </div>
        <div className="grid" style={{ gap: 8 }}>
          {[
            ["Venue", "Trumps", "Pink Street, Lisbon · ★ 4.7"],
            ["Venue", "Finalmente Club", "Príncipe Real · ★ 4.9 · drag"],
            ["Venue", "Bar 106", "Bairro Alto · ★ 4.6"],
            ["Article", "Where to drink in Lisbon: a queer guide", "Travel · 6 min · Mar 2026"],
            ["Group", "Lisbon Lesbian Hikers", "612 members · sport"],
            ["Event", "Pop Open Air", "Jun 27 · Doca de Alcântara"],
          ].map(([type, t, sub], i) => (
            <div key={i} className="card" style={{ padding: 14, display: "grid", gridTemplateColumns: "70px 1fr auto", gap: 14, alignItems: "center" }}>
              <span className="mono" style={{ color: "var(--accent)" }}>{type.toUpperCase()}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{t}</div>
                <div className="mono" style={{ color: "var(--muted)" }}>{sub}</div>
              </div>
              <span style={{ color: "var(--muted)" }}>↗</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PatternTags() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <TopNav active="Discover" />
      <div style={{ padding: "26px 28px 14px" }}>
        <div className="eyebrow">Tag graph</div>
        <h2 className="h-d" style={{ fontSize: 44 }}>Browse by what you love.</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", flex: 1, padding: "0 28px 28px", gap: 24, minHeight: 0 }}>
        <div className="card" style={{ position: "relative", overflow: "hidden", background: "var(--paper-2)" }}>
          {[
            [50, 50, 80, "drag", "var(--accent)"],
            [28, 30, 56, "lesbian", "var(--c1)"],
            [70, 28, 60, "trans", "var(--c4)"],
            [22, 70, 48, "music", "var(--c2)"],
            [78, 70, 52, "festival", "var(--c6)"],
            [50, 18, 36, "sober", "var(--c3)"],
            [50, 82, 42, "sport", "var(--c4)"],
            [10, 50, 30, "history", "var(--c5)"],
            [90, 50, 32, "food", "var(--c2)"],
          ].map(([x, y, r, label, c], i) => (
            <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)", width: r, height: r, borderRadius: 2, background: c, color: "#fff", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontSize: r * 0.22, boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}>{label}</div>
          ))}
          <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.25 }}>
            <line x1="50%" y1="50%" x2="28%" y2="30%" stroke="currentColor" strokeWidth="1" />
            <line x1="50%" y1="50%" x2="70%" y2="28%" stroke="currentColor" strokeWidth="1" />
            <line x1="50%" y1="50%" x2="22%" y2="70%" stroke="currentColor" strokeWidth="1" />
            <line x1="50%" y1="50%" x2="78%" y2="70%" stroke="currentColor" strokeWidth="1" />
            <line x1="50%" y1="50%" x2="50%" y2="18%" stroke="currentColor" strokeWidth="1" />
            <line x1="50%" y1="50%" x2="50%" y2="82%" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>
        <div>
          <div className="lbl">Selected</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 40, marginTop: 4 }}>drag</div>
          <div className="mono" style={{ color: "var(--muted)" }}>1,284 venues · 142 events · 38 articles</div>
          <hr />
          <div className="lbl">Related</div>
          <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
            {["cabaret", "burlesque", "lipsync", "pageant", "kings", "queens", "comedy", "club", "tourist-friendly"].map((t) => <span key={t} className="pill">{t}</span>)}
          </div>
          <hr />
          <div className="lbl">Top venues</div>
          <div style={{ marginTop: 8 }}>
            {[["Finalmente", "Lisbon"], ["Tipsy Crow", "Berlin"], ["Lips", "NYC"]].map(([n, c]) => (
              <div key={n} className="row" style={{ padding: "6px 0", borderTop: "1px solid var(--line)", justifyContent: "space-between" }}>
                <span>{n}</span><span className="mono" style={{ color: "var(--muted)" }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PatternWeather() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Logo size={16} />
        <span className="mono" style={{ color: "var(--muted)" }}>LISBON · NOW</span>
      </div>
      <div className="row" style={{ alignItems: "flex-end", gap: 16 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 130, lineHeight: 0.9 }}>23°</div>
        <div style={{ paddingBottom: 14 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 30 }}>Clear</div>
          <div className="mono" style={{ color: "var(--muted)" }}>FEELS 25° · WIND 6 KM/H · UV 6</div>
        </div>
      </div>
      <hr style={{ margin: "4px 0" }} />
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {[["Mon", 22, "☀"], ["Tue", 24, "☀"], ["Wed", 26, "☀"], ["Thu", 25, "⛅"], ["Fri", 23, "☁"], ["Sat", 21, "🌧"], ["Sun", 24, "⛅"]].map(([d, t, ic]) => (
          <div key={d} className="card" style={{ padding: 8, textAlign: "center" }}>
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{d}</div>
            <div style={{ fontSize: 22 }}>{ic}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>{t}°</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 14, marginTop: "auto" }}>
        <div className="lbl">Pride forecast</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 4 }}>Perfect parade weather Saturday — 24° and clear.</div>
      </div>
    </div>
  );
}

// ── 13 Admin / CMS / Security ────────────────────────────────────────────
function AdminSidebar({ active }) {
  return (
    <div style={{ background: "var(--ink)", color: "var(--paper)", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
      <Logo size={16} />
      <div style={{ height: 14 }} />
      <div className="lbl" style={{ color: "rgba(245,241,234,0.4)", marginBottom: 6, paddingLeft: 8 }}>Workspace</div>
      {["Overview", "Cities", "Venues", "Events", "Hotels", "Users", "Moderation", "CMS", "Translations", "Security", "Settings"].map((s) => (
        <div key={s} style={{ padding: "8px 10px", borderRadius: 8, background: s === active ? "rgba(245,241,234,0.12)" : "transparent", color: s === active ? "var(--paper)" : "rgba(245,241,234,0.7)", fontSize: 13 }}>{s}</div>
      ))}
      <div style={{ marginTop: "auto", padding: 10, fontSize: 11, opacity: 0.6 }}>v3.4 · build a8f2</div>
    </div>
  );
}

export function PatternAdmin() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: "220px 1fr" }}>
      <AdminSidebar active="Overview" />
      <div style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div className="row" style={{ padding: "16px 24px", borderBottom: "1px solid var(--line)", justifyContent: "space-between" }}>
          <div>
            <div className="eyebrow">Admin · workspace</div>
            <h2 className="h-d" style={{ fontSize: 32, marginTop: 2 }}>Today at Queer Guide</h2>
          </div>
          <div className="row">
            <span className="pill">Last 7 days ▾</span>
            <button className="btn">Export CSV</button>
          </div>
        </div>
        <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            ["Active users", "84,210", "+4.2%", "var(--c4)"],
            ["New venues", "126", "+18", "var(--accent)"],
            ["Events live", "412", "+7", "var(--c2)"],
            ["Reports queue", "8", "−2", "var(--c1)"],
          ].map(([l, big, delta, c]) => (
            <div key={l} className="card" style={{ padding: 16, borderLeft: `3px solid ${c}` }}>
              <div className="lbl">{l}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 38, marginTop: 4 }}>{big}</div>
              <div className="mono" style={{ color: "var(--muted)" }}>{delta} vs last week</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "0 24px 16px", display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, flex: 1, minHeight: 0 }}>
          <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="lbl">Sessions · last 7 days</div>
              <div className="mono" style={{ color: "var(--muted)" }}>local time · UTC+1</div>
            </div>
            <svg viewBox="0 0 600 220" style={{ width: "100%", flex: 1, marginTop: 12 }}>
              <defs>
                <linearGradient id="ag" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,160 C60,140 100,120 160,90 S280,40 340,80 480,150 600,90 L600,220 L0,220 Z" fill="url(#ag)" />
              <path d="M0,160 C60,140 100,120 160,90 S280,40 340,80 480,150 600,90" fill="none" stroke="var(--accent)" strokeWidth="2" />
              {[0,1,2,3,4,5,6].map((i) => (
                <text key={i} x={i*100} y="210" fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</text>
              ))}
            </svg>
          </div>
          <div className="card" style={{ padding: 16, overflow: "hidden" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="lbl">Moderation queue</div>
              <span className="mono" style={{ color: "var(--accent)" }}>8 pending</span>
            </div>
            <div className="grid" style={{ marginTop: 10, gap: 8 }}>
              {[
                ["Photo report", "Bar 106", "5m"],
                ["Spam comment", "Group · Berlin Bears", "12m"],
                ["Venue close request", "Trumps", "1h"],
                ["Article correction", "“Stockholm in 36h”", "2h"],
              ].map(([t, sub, when], i) => (
                <div key={i} className="row" style={{ padding: "8px 0", borderTop: i ? "1px solid var(--line)" : "none", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t}</div>
                    <div className="mono" style={{ color: "var(--muted)" }}>{sub}</div>
                  </div>
                  <div className="row">
                    <span className="mono" style={{ color: "var(--muted)" }}>{when}</span>
                    <span className="pill pill--solid">Review</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PatternCMS() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: "220px 1fr 280px" }}>
      <AdminSidebar active="CMS" />
      <div style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div className="row" style={{ padding: "12px 24px", borderBottom: "1px solid var(--line)", justifyContent: "space-between" }}>
          <div className="row">
            <span className="badge">DRAFT · v4</span>
            <span className="mono" style={{ color: "var(--muted)" }}>auto-saved 12s ago</span>
          </div>
          <div className="row">
            <button className="btn btn--ghost">Preview</button>
            <button className="btn">Save</button>
            <button className="btn btn--accent">Publish →</button>
          </div>
        </div>
        <div style={{ padding: "24px 64px", overflow: "hidden", flex: 1 }}>
          <div className="mono" style={{ color: "var(--accent)" }}>POLITICS · 8 MIN READ</div>
          <input style={{ width: "100%", border: 0, outline: "none", fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1.0, background: "transparent", color: "var(--ink)", marginTop: 8 }} defaultValue="Inside Greece's quiet shift on same-sex adoption." />
          <input style={{ width: "100%", border: 0, outline: "none", fontFamily: "inherit", fontSize: 16, color: "var(--muted)", background: "transparent", marginTop: 10 }} defaultValue="The 2024 reform passed without the protest predicted." />
          <div className="row" style={{ marginTop: 16, padding: "8px 12px", borderRadius: 3, border: "1px solid var(--line)", background: "#fff", gap: 4 }}>
            {["B", "I", "U", "H1", "H2", "“ ”", "—", "🔗", "📷", "🎬", "—", "↶", "↷"].map((t, i) => (
              <span key={i} style={{ padding: "4px 8px", fontFamily: t === "B" ? "serif" : t === "I" ? "serif" : "inherit", fontStyle: t === "I" ? "italic" : "normal", fontWeight: t === "B" ? 700 : 400, color: "var(--ink-2)", borderRight: i === 4 || i === 9 ? "1px solid var(--line)" : "none", paddingRight: 12, marginRight: i === 4 || i === 9 ? 4 : 0 }}>{t}</span>
            ))}
          </div>
          <div style={{ marginTop: 18, fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)" }}>
            <p style={{ margin: 0 }}>On the morning the bill passed, the bakery on Daedalus Street was open as usual. Christina, 62, was wrapping pies…</p>
          </div>
        </div>
      </div>
      <div style={{ borderLeft: "1px solid var(--line)", padding: 18, overflow: "hidden" }}>
        <div className="lbl">Status</div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="pill">Draft</span><span className="pill">Review</span><span className="pill pill--solid">Ready</span>
        </div>
        <hr />
        <div className="lbl">Author</div>
        <div className="row" style={{ marginTop: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 2, background: "var(--c2)" }} />
          <span style={{ fontSize: 13 }}>Paula Mantzouri</span>
        </div>
        <hr />
        <div className="lbl">Tags</div>
        <div className="row" style={{ marginTop: 8 }}>
          {["greece", "policy", "adoption", "+ add"].map((t, i) => <span key={t} className={i === 3 ? "pill" : "pill pill--solid"}>{t}</span>)}
        </div>
        <hr />
        <div className="lbl">Translations</div>
        <div className="grid" style={{ marginTop: 8, gap: 6 }}>
          {[["EN","Original"], ["EL","✓ ready"], ["DE","✓ ready"], ["PT","draft"], ["ES","needs work"], ["FR","queued"], ["+ 5 more",""]].map(([l, s], i) => (
            <div key={i} className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
              <span>{l}</span><span className="mono" style={{ color: "var(--muted)" }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PatternSecurity() {
  return (
    <div className="art" style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: "220px 1fr" }}>
      <AdminSidebar active="Security" />
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="row" style={{ padding: "16px 24px", borderBottom: "1px solid var(--line)", justifyContent: "space-between" }}>
          <div>
            <div className="eyebrow">Security · trust & safety</div>
            <h2 className="h-d" style={{ fontSize: 28, marginTop: 2 }}>Posture: <em style={{ color: "#22c55e" }}>good</em></h2>
          </div>
          <div className="row">
            <span className="badge badge--dot">All systems green</span>
            <button className="btn">Run audit</button>
          </div>
        </div>
        <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            ["MFA coverage", "94%", "of admins", "var(--c4)"],
            ["Active sessions", "1,212", "−3% vs week", "var(--c2)"],
            ["Incidents (30d)", "0", "last: 84 days", "var(--accent)"],
            ["Reports auto-cleared", "82%", "of 1,402", "var(--c6)"],
          ].map(([l, big, sub, c]) => (
            <div key={l} className="card" style={{ padding: 16, borderLeft: `3px solid ${c}` }}>
              <div className="lbl">{l}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 38, marginTop: 4 }}>{big}</div>
              <div className="mono" style={{ color: "var(--muted)" }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "0 24px 24px", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, flex: 1, minHeight: 0 }}>
          <div className="card" style={{ padding: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div className="lbl">Recent events</div>
            <div className="grid" style={{ marginTop: 10, gap: 0 }}>
              {[
                ["10:42", "auth.login", "ana@queerguide.com · IP 91.x.x", "ok"],
                ["10:18", "moderation.flag", "user 482910 · post hidden", "auto"],
                ["09:55", "auth.login_failed", "IP 188.x.x · rate-limited", "blocked"],
                ["09:12", "vault.read", "secrets/stripe · admin: lukas", "ok"],
                ["08:30", "auth.mfa.enroll", "user 992101", "ok"],
              ].map(([t, ev, sub, status], i) => (
                <div key={i} className="row" style={{ padding: "10px 0", borderTop: i ? "1px solid var(--line)" : "none", justifyContent: "space-between", fontSize: 13 }}>
                  <span className="mono" style={{ color: "var(--muted)" }}>{t}</span>
                  <span className="mono" style={{ color: "var(--accent)", flex: 1, marginLeft: 14 }}>{ev}</span>
                  <span style={{ color: "var(--muted)", flex: 2 }}>{sub}</span>
                  <span className={status === "blocked" ? "pill pill--accent" : status === "auto" ? "pill" : "pill pill--solid"}>{status}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="lbl">Recommendations</div>
            <div className="grid" style={{ marginTop: 10, gap: 10 }}>
              {[
                ["Enforce MFA on remaining 6% of admins", "high"],
                ["Rotate Supabase service key (last rotated 92d)", "medium"],
                ["Review role assignments in CMS", "low"],
              ].map(([t, p], i) => (
                <div key={i} className="row" style={{ padding: "10px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
                  <span className={p === "high" ? "pill pill--accent" : p === "medium" ? "pill pill--solid" : "pill"} style={{ width: 70, justifyContent: "center" }}>{p}</span>
                  <span style={{ flex: 1 }}>{t}</span>
                  <span style={{ color: "var(--muted)" }}>↗</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// expose
Object.assign(window, {
  PatternHome, PatternSignIn, PatternSignUp,
  PatternCity, PatternVenueList, PatternVenueDetail,
  PatternEvents, PatternFestival,
  PatternHotelSearch, PatternHotelDetail, PatternTravelDeals,
  PatternMap, PatternVillages, PatternVillageDetail,
  PatternGroups, PatternGroupDetail, PatternMessaging,
  PatternNews, PatternArticle, PatternPersonalities, PatternResources,
  PatternMarketplace, PatternMarketDetail,
  PatternSearch, PatternTags, PatternWeather,
  PatternAdmin, PatternCMS, PatternSecurity,
  Logo, PrideBar, TopNav, Footer, Field, FilterBar,
});

