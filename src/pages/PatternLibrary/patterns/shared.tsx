/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* eslint-disable */
import React from 'react';

/* Shared helpers used across desktop & mobile patterns. */

export const Logo = ({ size = 20, mark = true }) => (
  <span className="logo" style={{ fontSize: size }}>
    <span>Queer<span className="amp">·</span>Guide</span>
  </span>
);

// Compatibility shim — prefer rule lines, but keep PrideBar callable
export const PrideBar = ({ height = 1 }) => (
  <div style={{ height, background: "var(--ink)" }} />
);

export const TopNav = ({ active = "Discover" }) => (
  <div className="shell-nav">
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <Logo size={18} />
      <ul>
        {["Discover", "Cities", "Events", "Hotels", "Groups", "Resources"].map((l) => (
          <li key={l} style={{ color: l === active ? "var(--ink)" : "var(--muted)", fontWeight: l === active ? 500 : 400 }}>{l}</li>
        ))}
      </ul>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 10px", border: "1px solid var(--line)", borderRadius: 2, color: "var(--muted)", fontSize: 12 }}>
        <span>⌕</span><span style={{ minWidth: 110 }}>Search Queer Guide…</span><span className="mono" style={{ fontSize: 9, padding: "1px 5px", border: "1px solid var(--line)", borderRadius: 3 }}>⌘K</span>
      </div>
      <span className="pill">EN ▾</span>
      <div style={{ width: 30, height: 30, borderRadius: 2, background: "var(--ink)" }} />
    </div>
  </div>
);

export const Footer = () => (
  <div style={{ borderTop: "1px solid var(--ink)", background: "var(--paper)", padding: "32px 40px 24px" }}>
    <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr", gap: 32, fontSize: 12.5 }}>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 28, lineHeight: 1, letterSpacing: "-0.01em" }}>
          Queer<em style={{ color: "var(--accent)" }}>·</em>Guide
        </div>
        <div style={{ color: "var(--muted)", marginTop: 12, maxWidth: 240, fontSize: 13, lineHeight: 1.5 }}>
          A field guide to queer life in 64 cities — written by people who live there, edited in Berlin and Lisbon.
        </div>
      </div>
      {[
        ["Discover", ["Cities", "Villages", "Map", "Weather"]],
        ["Travel", ["Hotels", "Flights", "Tours", "Deals"]],
        ["Community", ["Groups", "Events", "News", "People"]],
        ["Company", ["About", "Press", "Privacy", "Status"]],
      ].map(([h, items]) => (
        <div key={h}>
          <div className="lbl" style={{ marginBottom: 10 }}>{h}</div>
          {items.map((i) => <div key={i} style={{ color: "var(--ink-2)", padding: "3px 0" }}>{i}</div>)}
        </div>
      ))}
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, paddingTop: 14, borderTop: "1px solid var(--line)", fontSize: 11.5, color: "var(--muted)" }}>
      <span className="mono">© 2026 Queer Guide · Berlin / Lisbon</span>
      <span className="mono">Vol. III · Issue 14 · Spring</span>
    </div>
  </div>
);
