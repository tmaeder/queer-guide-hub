import { createTheme, type ThemeOptions } from '@mui/material/styles';
import { duration, ease, transition } from '@/lib/animation';
import './theme.d.ts';

// ─── Brand Colors (importable outside React context) ─────────────────────────
export const brandColors = {
  main: '#b60d3d',
  light: '#ff7386',
  dark: '#a20033',
} as const;

// ─── Palettes ─────────────────────────────────────────────────────────────────
// All colors are solid (alpha = 1). No rgba/hsla with transparency allowed.

const lightPalette = {
  primary: { main: '#0e0e0e', contrastText: '#ffffff' },
  secondary: { main: '#f3f0ef', contrastText: '#2f2e2e' },
  brand: { main: brandColors.main, light: brandColors.light, dark: brandColors.dark, contrastText: '#ffefef' },
  accent: { main: '#feb700', light: '#ffcf4d', dark: '#694a00', contrastText: '#392700' },
  error: { main: '#b31b25', contrastText: '#ffefee' },
  warning: { main: '#feb700', contrastText: '#392700' },
  success: { main: '#22c55e', contrastText: '#ffffff' },
  background: { default: '#f9f6f5', paper: '#ffffff' },
  text: { primary: '#2f2e2e', secondary: '#5c5b5b' },
  divider: '#eae7e7',
};

const darkPalette = {
  primary: { main: '#ffffff', contrastText: '#0e0e0e' },
  secondary: { main: '#1a1a1a', contrastText: '#f2f2f2' },
  brand: { main: brandColors.light, light: '#ff9dab', dark: brandColors.main, contrastText: '#0e0e0e' },
  accent: { main: '#ffcf4d', light: '#ffe08a', dark: '#feb700', contrastText: '#0e0e0e' },
  error: { main: '#fb5151', contrastText: '#ffffff' },
  warning: { main: '#feb700', contrastText: '#392700' },
  success: { main: '#22c55e', contrastText: '#ffffff' },
  background: { default: '#0d0d0d', paper: '#121212' },
  text: { primary: '#f2f2f2', secondary: '#9e9c9c' },
  divider: '#1a1a1a',
};

// ─── Shared theme options ─────────────────────────────────────────────────────
// Rule: NO transparent, NO rgba() with alpha<1, NO backdropFilter, NO blur.

const baseThemeOptions: ThemeOptions = {
  shape: {
    borderRadius: 16,
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
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 9999,
          transition: `all ${duration.fast}s ${ease.smooth}`,
          fontWeight: 600,
          '&:hover': {
            opacity: 0.9,
          },
          '&:active': {
            transform: 'scale(0.97)',
            transition: `all ${duration.instant}s ${ease.smooth}`,
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
          borderRadius: 16,
          transition: transition.normal,
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
          },
          '&.MuiPaper-outlined': {
            boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
            '&:hover': {
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
            },
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
          borderRadius: 16,
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600,
          fontSize: '0.75rem',
          transition: transition.fast,
          '&:hover': {
            transform: 'scale(1.04)',
          },
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
            borderRadius: 16,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
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
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          borderRadius: 16,
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
          transition: transition.fast,
          '&:hover': {
            transform: 'scale(1.08)',
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
          borderColor: 'inherit',
        },
      },
    },
    MuiAccordion: {
      defaultProps: {
        disableGutters: true,
        elevation: 0,
      },
      styleOverrides: {
        root: {
          borderRadius: '16px !important',
          '&:before': {
            display: 'none',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          borderRadius: 3,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          height: 6,
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          borderRadius: 999,
        },
      },
    },
  },
};

// ─── Shadows (tonal layering — ambient only for modals/FABs) ────────────────
const customShadows = [
  'none',
  'none',
  'none',
  '0 40px 60px -15px rgb(47 46 46 / 0.06)',
  '0 50px 60px -15px rgb(47 46 46 / 0.08)',
  ...Array(20).fill('none'),
] as unknown as ThemeOptions['shadows'];

export function createAppTheme(mode: 'light' | 'dark') {
  const palette = mode === 'light' ? lightPalette : darkPalette;

  return createTheme({
    ...baseThemeOptions,
    palette: {
      mode,
      ...palette,
    },
    shadows: customShadows,
  });
}
