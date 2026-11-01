import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, resolve, type Colors } from './tokens';

type Theme = { scheme: 'light' | 'dark'; colors: Colors };

const ThemeContext = createContext<Theme>({ scheme: 'light', colors: resolve(light) });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const value = useMemo<Theme>(
    () => ({ scheme, colors: resolve(scheme === 'dark' ? dark : light) }),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
