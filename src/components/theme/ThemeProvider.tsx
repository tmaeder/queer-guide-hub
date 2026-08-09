import * as React from "react";

/**
 * Dark mode was removed 2026-08 (subway-map rebrand): the identity is a fixed
 * paper/ink poster, so the app is light-only. The provider keeps its old API
 * shape — `theme` / `resolvedTheme` / `setTheme` — because maps, sonner and a
 * few chart components still read `resolvedTheme`; it now always reports
 * "light", strips any persisted dark class, and `setTheme` is a no-op.
 */

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const LIGHT_STATE: ThemeProviderState = {
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => null,
};

const ThemeProviderContext = React.createContext<ThemeProviderState>(LIGHT_STATE);

export function ThemeProvider({ children, storageKey = "ui-theme" }: ThemeProviderProps) {
  React.useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* private mode — fine */
    }
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => {
        meta.content = "#FAFAF5";
      });
  }, [storageKey]);

  return (
    <ThemeProviderContext.Provider value={LIGHT_STATE}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
