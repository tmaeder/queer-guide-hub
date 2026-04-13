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
  text: { primary: '#0a0a0a', secondary: '#666666' },
  divider: 'transparent',
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
  text: { primary: '#f2f2f2', secondary: '#999999' },
  divider: 'transparent',
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
