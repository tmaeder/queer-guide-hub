import { createTheme, type ThemeOptions } from '@mui/material/styles';

// ─── Palettes ─────────────────────────────────────────────────────────────────
// All colors are solid (alpha = 1). No rgba/hsla with transparency allowed.

const lightPalette = {
  primary: { main: '#222222', contrastText: '#ffffff' },
  secondary: { main: '#f4f4f5', contrastText: '#18181b' },
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
    borderRadius: 10,
  },
  typography: {
    fontFamily: "'Noto Sans', system-ui, -apple-system, sans-serif",
    h1: { fontFamily: "'Montserrat', sans-serif", fontWeight: 700, letterSpacing: '-0.025em' },
    h2: { fontFamily: "'Montserrat', sans-serif", fontWeight: 700, letterSpacing: '-0.025em' },
    h3: { fontFamily: "'Montserrat', sans-serif", fontWeight: 700, letterSpacing: '-0.025em' },
    h4: { fontFamily: "'Montserrat', sans-serif", fontWeight: 700, letterSpacing: '-0.015em' },
    h5: { fontFamily: "'Montserrat', sans-serif", fontWeight: 700, letterSpacing: '-0.015em' },
    h6: { fontFamily: "'Montserrat', sans-serif", fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 500 },
    button: { textTransform: 'none', fontWeight: 500 },
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
          borderRadius: 10,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
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
          borderRadius: 10,
          transition: 'box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 600,
          fontSize: '0.75rem',
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
            borderRadius: 10,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
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
          borderRadius: 10,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
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
          '&:before': {
            display: 'none',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          borderRadius: 2,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          height: 6,
        },
      },
    },
  },
};

// ─── Shadows (solid only — no rgba) ───────────────────────────────────────────
const customShadows = [
  'none',
  '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
  '0 10px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.06)',
  '0 4px 12px 0 rgb(0 0 0 / 0.12)',
  ...Array(21).fill('none'),
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
