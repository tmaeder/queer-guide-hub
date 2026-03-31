import '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    brand: Palette['primary'];
    accent: Palette['primary'];
  }
  interface PaletteOptions {
    brand?: PaletteOptions['primary'];
    accent?: PaletteOptions['primary'];
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsColorOverrides {
    brand: true;
    accent: true;
  }
}

declare module '@mui/material/Chip' {
  interface ChipPropsColorOverrides {
    brand: true;
    accent: true;
  }
}
