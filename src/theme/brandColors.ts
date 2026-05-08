// Strict monochrome palette — importable outside React context.
// These hex literals mirror the HSL CSS vars in `src/index.css`.
//   --brand (light) = 0 0% 4%   ≈ #0a0a0a
//   --brand (dark)  = 0 0% 100% ≈ #ffffff
// Name kept ("brandColors") for backward compatibility with ~120 consumers.
export const brandColors = {
  main: '#0a0a0a',
  light: '#ffffff',
  dark: '#000000',
} as const;
