# Navigation and icon sizing

The supplied reference is the primary navigation. Its category links become text-only at every desktop breakpoint, including the compact header. Labels stay visible; horizontal scrolling preserves access at tablet widths.

All on-screen icons have a 64px minimum, twice the roughly 32px reference icons. The common renderer enforces the floor through both SVG dimensions and inline CSS. External brand marks, OAuth artwork, and profile pictograms receive the same floor. Larger artwork retains its size.

Card glyphs render outside scaled SVG artwork so they stay at least 64 CSS pixels on phone grids. Map category and saved icons use 64px raster assets at unit display scale, with larger backing pins. Shared controls, header offsets, mobile dock sizing, and footer clearance accommodate the new dimensions. Narrow mobile docks scroll rather than shrink their symbols. Favicons keep their browser-controlled size.
