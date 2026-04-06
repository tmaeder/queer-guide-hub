import { createTheme, type ThemeOptions } from '@mui/material/styles';
import { duration, ease, transition } from '@/lib/animation';
import './theme.d.ts';

// ─── Brand Colors (importable outside React context) ─────────────────────────
export const brandColors = {
  main: '#DB2777',
  light: '#F472B6',
  dark: '#BE185D',
} as const;

// ─── Palettes ─────────────────────────────────────────────────────────────────
// All colors are solid (alpha = 1). No rgba/hsla with transparency allowed.

const lightPalette = {
  primary: { main: '#222222', contrastText: '#ffffff' },
  secondary: { main: '#f4f4f5', contrastText: '#18181b' },
  brand: { main: brandColors.main, light: brandColors.light, dark: brandColors.dark, contrastText: '#ffffff' },
  accent: { main: '#F59E0B', light: '#FCD34D', dark: '#D97706', contrastText: '#111111' },
  error: { main: '#ef4444', contrastText: '#ffffff' },
  warning: { main: '#f59e0b', contrastText: '#ffffff' },
  success: { main: '#22c55e', contrastText: '#ffffff' },
  background: { default: '#fcfcfc', paper: '#ffffff' },
  text: { primary: '#171717', secondary: '#666666' },
  divider: '#e4e4e7',
};

const darkPalette = {
  primary: { main: '#ffffff', contrastText: '#111111' },
  secondary: { main: '#27272a', contrastText: '#f2f2f2' },
  brand: { main: brandColors.light, light: '#F9A8D4', dark: brandColors.main, contrastText: '#111111' },
  accent: { main: '#FBBF24', light: '#FDE68A', dark: '#F59E0B', contrastText: '#111111' },
  error: { main: '#dc2626', contrastText: '#ffffff' },
  warning: { main: '#f59e0b', contrastText: '#ffffff' },
  success: { main: '#22c55e', contrastText: '#ffffff' },
  background: { default: '#0c0c0f', paper: '#111114' },
  text: { primary: '#f2f2f2', secondary: '#a8a8b3' },
  divider: '#27272a',
};

// ─── Shared theme options ─────────────────────────────────────────────────────
// Rule: NO transparent, NO rgba() with alpha<1, NO backdropFilter, NO blur.

const baseThemeOptions: ThemeOptions = {
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    h1: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, letterSpacing: '-0.03em' },
    h2: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, letterSpacing: '-0.025em' },
    h3: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, letterSpacing: '-0.02em' },
    h4: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, letterSpacing: '-0.015em' },
    h5: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, letterSpacing: '-0.015em' },
    h6: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 500 },
    body1: { lineHeight: 1.65 },
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
          borderRadius: 12,
          transition: transition.fast,
          '&:hover': {
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'scale(0.97)',
            transition: `all ${duration.instant}s ${ease.smooth}`,
          },
        },
        sizeSmall: {
          height: 36,
          padding: '0 12px',
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
          borderRadius: 12,
          transition: transition.normal,
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
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
            transform: 'scale(1.04) translateY(-1px)',
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
            borderRadius: 12,
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
          borderRadius: 12,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
      defaultProps: {
        animation: 'wave',
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
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
          borderRadius: '12px !important',
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

// ─── Shadows (solid only — no rgba) ───────────────────────────────────────────
const customShadows = [
  'none',
  '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
  '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
  '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.04)',
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
