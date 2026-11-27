/** Localize recognized country names without changing stored nationality data. */
let englishRegions: Map<string, string> | undefined;
const displays = new Map<string, Intl.DisplayNames>();

export function localizedCountryName(name: string | undefined, locale: string): string | undefined {
  if (!name) return name;
  try {
    if (!englishRegions) {
      const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
      englishRegions = new Map();
      // Build the reverse CLDR lookup once. Unknown/historical names stay intact.
      for (let a = 65; a <= 90; a++) {
        for (let b = 65; b <= 90; b++) {
          const code = String.fromCharCode(a, b);
          const label = names.of(code);
          if (label && label !== code) englishRegions.set(label.toLowerCase(), code);
        }
      }
    }
    const code = englishRegions.get(name.trim().toLowerCase());
    if (!code) return name;
    const language = locale.replaceAll('_', '-');
    let display = displays.get(language);
    if (!display) {
      display = new Intl.DisplayNames([language], { type: 'region', fallback: 'none' });
      displays.set(language, display);
    }
    return display.of(code) || name;
  } catch {
    return name;
  }
}
