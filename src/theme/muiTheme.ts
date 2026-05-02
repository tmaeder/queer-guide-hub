import { createTheme, type ThemeOptions, type Direction } from '@mui/material/styles';
import { duration, ease, transition } from '@/lib/animation';
import './theme.d.ts';

// ─── Brand Colors (importable outside React context) ─────────────────────────
// IMPORTANT: these hex literals mirror the HSL CSS vars in `src/index.css`.
// Keep them in sync — MUI's theme is created before CSS loads, so we can't
// read `var(--brand)` here. If you change one side, change the other.
//   --brand (light)   = 346 87% 38%   ≈ #b60d3d
//   --brand (dark)    = 346 100% 65%  ≈ #ff7386
//   --destructive (l) = 356 74% 40%   ≈ #b31b25
//   --destructive (d) = 0 96% 65%     ≈ #fb5151
export const brandColors = {
  main: '#b60d3d',
  light: '#ff7386',
  dark: '#a20033',
} as const;

// ─── Palettes ─────────────────────────────────────────────────────────────────
// Strict monochrome + single accent (brand magenta). No transparency.

const lightPalette = {
  primary: { main: '#0a0a0a', contrastText: '#ffffff' },
  secondary: { main: '#f0f0f0', contrastText: '#0a0a0a' },
  brand: { main: brandColors.main, light: brandColors.light, dark: brandColors.dark, contrastText: '#ffffff' },
  accent: { main: brandColors.main, light: brandColors.light, dark: brandColors.dark, contrastText: '#ffffff' },
  error: { main: '#b31b25', contrastText: '#ffffff' },
  warning: { main: '#b31b25', contrastText: '#ffffff' },
  success: { main: '#0a0a0a', contrastText: '#ffffff' },
  background: { default: '#ffffff', paper: '#f5f5f5' },
  // WCAG 1.4.3 — bumped from #666 (5.74:1) to #595959 so muted text retains
  // ≥4.5:1 over light tinted/action.hover surfaces.
  text: { primary: '#0a0a0a', secondary: '#595959' },
  divider: 'rgba(0,0,0,0)',
};

const darkPalette = {
  primary: { main: '#ffffff', contrastText: '#0a0a0a' },
  secondary: { main: '#1a1a1a', contrastText: '#ffffff' },
  brand: { main: brandColors.light, light: '#ff9dab', dark: brandColors.main, contrastText: '#0a0a0a' },
  accent: { main: brandColors.light, light: '#ff9dab', dark: brandColors.main, contrastText: '#0a0a0a' },
  error: { main: '#fb5151', contrastText: '#ffffff' },
  warning: { main: '#fb5151', contrastText: '#ffffff' },
  success: { main: '#ffffff', contrastText: '#0a0a0a' },
  background: { default: '#0a0a0a', paper: '#111111' },
  // WCAG 1.4.3 — bumped from #999 (4.98:1, fails on muted bg) to #adadad.
  text: { primary: '#f2f2f2', secondary: '#adadad' },
  divider: 'rgba(0,0,0,0)',
};

// ─── Shared theme options ─────────────────────────────────────────────────────
// Strict flat: 0 radius, 0 borders, 0 shadows.

const baseThemeOptions: ThemeOptions = {
  shape: {
    borderRadius: 0,
  },
  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    h1: { fontFamily: "'Inter', sans-serif", fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.85 },
    h2: { fontFamily: "'Inter', sans-serif", fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.0 },
    h3: { fontFamily: "'Inter', sans-serif", fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1 },
    h4: { fontFamily: "'Inter', sans-serif", fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 },
    h5: { fontFamily: "'Inter', sans-serif", fontWeight: 700, letterSpacing: '-0.015em' },
    h6: { fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 500 },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.6 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFeatureSettings: '"rlig" 1, "calt" 1',
        },
      },
    },
    MuiTypography: {
      defaultProps: {
        // MUI's default maps subtitle1/2 → <h6>, which causes heading-order
        // violations whenever subtitles are used decoratively without a
        // preceding h2-h5. Render them as <p> instead — same visual,
        // semantically neutral.
        variantMapping: {
          subtitle1: 'p',
          subtitle2: 'p',
        },
      },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          // Cover both MUI's class (set by its focus listener) and the native
          // :focus-visible pseudo so programmatic focus also gets a ring.
          '&.Mui-focusVisible, &:focus-visible': {
            outline: `2px solid ${brandColors.main}`,
            outlineOffset: '2px',
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          '&.Mui-focusVisible, &:focus-visible': {
            outline: `2px solid ${brandColors.main}`,
            outlineOffset: '-2px',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          border: 'none',
          transition: `all ${duration.fast}s ${ease.smooth}`,
          fontWeight: 600,
          '&:hover': {
            opacity: 0.85,
          },
          '&:active': {
            opacity: 0.7,
            transition: `all ${duration.instant}s ${ease.smooth}`,
          },
        },
        outlined: {
          border: 'none',
          backgroundColor: 'rgba(128,128,128,0.12)',
          '&:hover': {
            border: 'none',
            backgroundColor: 'rgba(128,128,128,0.18)',
          },
        },
        sizeSmall: {
          height: 36,
          padding: '4px 12px',
          minHeight: 44,
        },
        sizeMedium: {
          height: 40,
          padding: '0 16px',
        },
        sizeLarge: {
          height: 44,
          padding: '0 32px',
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          transition: transition.normal,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
          '&.MuiPaper-outlined': {
            border: 'none',
            boxShadow: 'none',
          },
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 0,
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          fontWeight: 600,
          fontSize: '0.75rem',
          border: 'none',
          transition: transition.fast,
          '&:hover': {
            opacity: 0.85,
          },
        },
        outlined: {
          border: 'none',
          backgroundColor: 'rgba(128,128,128,0.12)',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 0,
            '& fieldset': {
              border: 'none',
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          backgroundColor: 'rgba(128,128,128,0.06)',
          '& fieldset': {
            border: 'none',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 0,
          animation: `scale-in ${duration.normal}s ${ease.smooth} both`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRadius: 0,
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
      },
      styleOverrides: {
        tooltip: {
          borderRadius: 0,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 0,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
        },
      },
      defaultProps: {
        animation: 'wave',
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: 44,
          minHeight: 44,
          borderRadius: 0,
          transition: transition.fast,
          '&:hover': {
            opacity: 0.85,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: 'inherit',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderWidth: 0,
        },
      },
    },
    MuiContainer: {
      defaultProps: {
        maxWidth: false as const,
      },
    },
    MuiAccordion: {
      defaultProps: {
        disableGutters: true,
        elevation: 0,
      },
      styleOverrides: {
        root: {
          borderRadius: '0 !important',
          '&:before': {
            display: 'none',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          borderRadius: 0,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          height: 6,
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          borderRadius: 0,
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          borderRadius: 0,
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: 0,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 0,
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          borderRadius: 0,
        },
      },
    },
  },
};

// ─── Shadows — all none (strict flat) ─────────────────────────────────────────
const customShadows = Array(25).fill('none') as unknown as ThemeOptions['shadows'];

export function createAppTheme(mode: 'light' | 'dark', direction: Direction = 'ltr') {
  const palette = mode === 'light' ? lightPalette : darkPalette;

  return createTheme({
    ...baseThemeOptions,
    direction,
    palette: {
      mode,
      ...palette,
    },
    shadows: customShadows,
  });
}
