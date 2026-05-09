// Brand color constants — importable outside React context.
// queer.guide ships a strict-monochrome design system: there is no
// chromatic brand color. The export is retained as a thin compat
// shim so legacy admin imports keep working; all values resolve to
// the neutral foreground.
//   --foreground (light) = 0 0% 4%   ≈ #0a0a0a
//   --foreground (dark)  = 0 0% 96%  ≈ #f5f5f5
export const brandColors = {
  main: '#0a0a0a',
  light: '#f5f5f5',
  dark: '#000000',
} as const;
