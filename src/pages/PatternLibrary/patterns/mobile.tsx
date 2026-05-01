/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* eslint-disable */
import React from 'react';
import { Logo } from './shared';

/* ============== MOBILE PATTERNS ============== */


// Queer Guide — mobile patterns

function Phone({ children }) {
  return (
    <div className="iphone">
      <div className="iphone-screen">
        <div className="iphone-notch" />
        <div className="iphone-status">
          <span>9:41</span>
          <span style={{ opacity: 0.85 }}>●●● 5G ▮</span>
        </div>
        <div className="iphone-body">{children}</div>
        <div className="iphone-home" />
      </div>
    </div>
  );
}

function MobileNav({ active = "Home" }) {
  return (
    <div className="tab-bar">
      {[["Home", "Home"], ["Cities", "Cities"], ["Map", "Map"], ["Groups", "Groups"], ["Me", "Me"]].map(([k, l]) => (
        <i key={k} className={k === active ? "act" : ""}>
          <span className="tab-dot" />
          <span>{l}</span>
        </i>
      ))}
    </div>
  );
}

function MobileHeader({ title, sub }) {
  return (
    <div style={{ padding: "12px 18px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Logo size={16} />
      <div style={{ display: "flex", gap: 8 }}>
        <span className="pill" style={{ padding: "3px 8px", fontSize: 11 }}>EN</span>
        <div style={{ width: 26, height: 26, borderRadius: 2, background: "var(--ink)" }} />
      </div>
    </div>
  );
}

// ── Home (mobile) ────────────────────────────────────────────────────────
export function PatternHomeMobile() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <Phone>
        <MobileHeader />
        <div style={{height:1,background:"var(--ink)"}} />
        <div style={{ padding: "16px 18px 8px" }}>
          <div className="eyebrow">Spring · 64 destinations</div>
          <div className="h-d" style={{ fontSize: 36, lineHeight: 1.0, marginTop: 8 }}>Travel as your <em style={{ color: "var(--accent)" }}>whole</em> self.</div>
          <div style={{ padding: "10px 12px", border: "1px solid var(--line-strong)", borderRadius: 2, marginTop: 12, fontSize: 12, color: "var(--muted)" }}>⌕ Cities, venues, events…</div>
        </div>
        <div style={{ padding: "8px 18px" }}>
          <div className="lbl">Trending</div>
          <div style={{ display: "flex", gap: 10, overflowX: "hidden", marginTop: 8 }}>
            {[["Berlin", "DE"], ["Lisbon", "PT"], ["Mexico City", "MX"], ["Bangkok", "TH"]].map(([n, c]) => (
              <div key={n} style={{ flex: "0 0 110px" }}>
                <div className="ph" style={{ height: 130, borderRadius: 10 }} data-ph={n} />
                <div style={{ marginTop: 6, fontFamily: "var(--font-display)", fontSize: 18 }}>{n}</div>
                <div className="mono" style={{ color: "var(--muted)" }}>{c}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "12px 18px 8px" }}>
          <div className="lbl">This weekend</div>
          {[
            ["Lisbon Pride", "Sat · main parade", "var(--c2)"],
            ["Drag Bingo", "Hafen, Berlin · 21h", "var(--c6)"],
            ["Sober Brunch", "Madrid · Sun 11h", "var(--c4)"],
          ].map(([t, sub, c]) => (
            <div key={t} className="card" style={{ padding: 12, marginTop: 8, display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: c }} />
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{t}</div>
                <div className="mono" style={{ color: "var(--muted)" }}>{sub}</div>
              </div>
              <span className="pill" style={{ padding: "3px 8px", fontSize: 10 }}>+ Save</span>
            </div>
          ))}
        </div>
        <MobileNav active="Home" />
      </Phone>
    </div>
  );
}

// ── Sign in (mobile) ─────────────────────────────────────────────────────
export function PatternSignInMobile() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <Phone>
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
          <Logo size={16} />
          <div style={{ marginTop: 12 }}>
            <div className="eyebrow">Welcome back</div>
            <div className="h-d" style={{ fontSize: 36, marginTop: 6 }}>Sign in to <em style={{ color: "var(--accent)" }}>Queer Guide</em></div>
          </div>
          <div>
            <div className="lbl">Email</div>
            <div style={{ marginTop: 6, padding: "11px 12px", border: "1px solid var(--line-strong)", borderRadius: 3, background: "#fff", fontSize: 13 }}>alex@example.com</div>
          </div>
          <div>
            <div className="lbl">Password</div>
            <div style={{ marginTop: 6, padding: "11px 12px", border: "1px solid var(--line-strong)", borderRadius: 3, background: "#fff", fontSize: 13 }}>••••••••</div>
          </div>
          <button className="btn btn--accent" style={{ height: 44, justifyContent: "center" }}>Sign in →</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 11, justifyContent: "center" }}>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span>or</span>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          <button className="btn btn--ghost" style={{ height: 40, justifyContent: "center" }}> Continue with Apple</button>
          <button className="btn btn--ghost" style={{ height: 40, justifyContent: "center" }}>G  Continue with Google</button>
          <div style={{ marginTop: "auto", color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
            New here? <span style={{ color: "var(--ink)", textDecoration: "underline" }}>Create account</span>
          </div>
          <div style={{height:1,background:"var(--ink)"}} />
        </div>
      </Phone>
    </div>
  );
}

// ── City (mobile) ────────────────────────────────────────────────────────
export function PatternCityMobile() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <Phone>
        <div className="ph" style={{ height: 200, position: "relative" }} data-ph="Lisbon">
          <div style={{ position: "absolute", left: 16, bottom: 12, color: "#fff" }}>
            <div className="mono" style={{ opacity: 0.85 }}>PORTUGAL</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 44, lineHeight: 0.95 }}>Lisbon</div>
          </div>
          <div style={{ position: "absolute", right: 12, top: 12, display: "flex", gap: 6 }}>
            <span className="pill pill--solid" style={{ fontSize: 10 }}>★ 4.8</span>
            <span className="pill pill--accent" style={{ fontSize: 10 }}>Pride · Jun 21</span>
          </div>
        </div>
        <div style={{ padding: "12px 18px", display: "flex", gap: 6, overflowX: "hidden", borderBottom: "1px solid var(--line)" }}>
          {["Overview", "Venues", "Events", "Hotels", "Map", "Tips"].map((t, i) => (
            <span key={t} className={i === 1 ? "pill pill--solid" : "pill"} style={{ flexShrink: 0, fontSize: 11 }}>{t}</span>
          ))}
        </div>
        <div style={{ padding: "12px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div className="lbl">412 venues</div>
            <span className="mono" style={{ color: "var(--muted)" }}>sort: ★ ▾</span>
          </div>
          {[
            ["Trumps", "Pink Street · Club", "★ 4.7", "var(--c1)"],
            ["Finalmente", "Príncipe Real · Drag", "★ 4.9", "var(--c2)"],
            ["Bar 106", "Bairro Alto · Bar", "★ 4.6", "var(--c4)"],
            ["Construction", "Cais do Sodré · Club", "★ 4.5", "var(--c6)"],
          ].map(([n, sub, r, c], i) => (
            <div key={i} className="card" style={{ padding: 10, display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 10, alignItems: "center", marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: c }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{n}</div>
                <div className="mono" style={{ color: "var(--muted)", fontSize: 10 }}>{sub}</div>
              </div>
              <span style={{ color: "var(--accent)", fontSize: 11 }}>{r}</span>
            </div>
          ))}
        </div>
        <MobileNav active="Cities" />
      </Phone>
    </div>
  );
}

// ── Venue (mobile) ───────────────────────────────────────────────────────
export function PatternVenueMobile() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <Phone>
        <div className="ph" style={{ height: 220 }} data-ph="Finalmente · stage" />
        <div style={{ padding: "14px 18px" }}>
          <div className="eyebrow">Drag · Cabaret · Late</div>
          <div className="h-d" style={{ fontSize: 32, marginTop: 4 }}>Finalmente Club</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span className="mono" style={{ color: "var(--muted)" }}>Príncipe Real, Lisbon</span>
            <span style={{ color: "var(--accent)" }}>★ 4.9</span>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {["Drag", "Late", "€€€"].map((t) => <span key={t} className="pill" style={{ fontSize: 11 }}>{t}</span>)}
          </div>
          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <div className="lbl">Tonight</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 2 }}>Open · 23h — 06h</div>
            <div className="row" style={{ marginTop: 6 }}>
              <span className="badge badge--dot">Cover €10</span>
              <span className="badge">Drag 00:30</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn--accent" style={{ flex: 1, justifyContent: "center" }}>Add to plan</button>
            <button className="btn btn--ghost" style={{ width: 44, justifyContent: "center" }}>♡</button>
          </div>
          <div className="lbl" style={{ marginTop: 16 }}>Address</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>R. Palmeira 38, 1200-313 Lisboa</div>
          <div className="ph" style={{ height: 100, marginTop: 8 }} data-ph="map" />
        </div>
        <MobileNav active="Cities" />
      </Phone>
    </div>
  );
}

// ── Events (mobile) ──────────────────────────────────────────────────────
export function PatternEventsMobile() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <Phone>
        <MobileHeader />
        <div style={{ padding: "8px 18px 10px" }}>
          <div className="eyebrow">Events</div>
          <div className="h-d" style={{ fontSize: 30, marginTop: 4 }}>This weekend.</div>
        </div>
        <div style={{ padding: "0 18px 8px", display: "flex", gap: 6, overflowX: "hidden" }}>
          {["Today", "Sat", "Sun", "Mon", "Tue", "Wed"].map((d, i) => (
            <span key={d} className={i === 1 ? "pill pill--solid" : "pill"} style={{ fontSize: 11 }}>{d}</span>
          ))}
        </div>
        <div style={{ padding: "0 18px" }}>
          {[
            ["Lisbon Pride · main parade", "Sat 16:00 · Av. da Liberdade", "var(--c1)", "Free"],
            ["Pop Open Air", "Sat 21:00 · Doca de Alcântara", "var(--c2)", "€38"],
            ["Drag Bingo", "Sat 22:00 · Finalmente", "var(--c6)", "€10"],
            ["Sunday Brunch", "Sun 11:00 · Silo Coffee", "var(--c4)", "Free"],
          ].map(([t, sub, c, p], i) => (
            <div key={i} className="card" style={{ padding: 12, marginBottom: 8, display: "grid", gridTemplateColumns: "4px 1fr auto", gap: 12 }}>
              <div style={{ background: c, borderRadius: 2 }} />
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{t}</div>
                <div className="mono" style={{ color: "var(--muted)", fontSize: 10, marginTop: 3 }}>{sub}</div>
              </div>
              <span className="pill" style={{ fontSize: 10 }}>{p}</span>
            </div>
          ))}
        </div>
        <MobileNav active="Cities" />
      </Phone>
    </div>
  );
}

// ── Map (mobile) ─────────────────────────────────────────────────────────
export function PatternMapMobile() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <Phone>
        <div className="ph" style={{ flex: 1, height: 480, position: "relative" }} data-ph="map · Lisbon">
          <div style={{ position: "absolute", left: 12, top: 12, right: 12 }}>
            <div style={{ padding: "10px 14px", borderRadius: 2, background: "#fff", border: "1px solid var(--line-strong)", fontSize: 12, color: "var(--muted)" }}>⌕ Search this area</div>
          </div>
          {[[40, 35, "var(--c1)", 8], [60, 45, "var(--c2)", 12], [50, 65, "var(--accent)", 18], [30, 55, "var(--c4)", 4]].map(([x, y, c, n], i) => (
            <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)", width: 32, height: 32, borderRadius: 2, background: c, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11, boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>{n}</div>
          ))}
          <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, padding: 12, background: "#fff", borderRadius: 4, display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 10, alignItems: "center", boxShadow: "0 6px 24px rgba(0,0,0,0.18)" }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--accent)" }} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>Finalmente</div>
              <div className="mono" style={{ color: "var(--muted)", fontSize: 10 }}>★ 4.9 · Drag · 0.3 km</div>
            </div>
            <span className="pill pill--solid" style={{ fontSize: 11 }}>Open</span>
          </div>
        </div>
        <MobileNav active="Map" />
      </Phone>
    </div>
  );
}

Object.assign(window, {
  PatternHomeMobile, PatternSignInMobile, PatternCityMobile,
  PatternVenueMobile, PatternEventsMobile, PatternMapMobile,
  Phone, MobileNav, MobileHeader,
});

