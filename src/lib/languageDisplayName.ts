/** ISO 639-1 code → language name in the UI language ("de" → "German"). */
export function languageDisplayName(code: string, uiLanguage: string): string {
  try {
    const DN = (Intl as unknown as { DisplayNames?: typeof Intl.DisplayNames }).DisplayNames;
    if (DN) {
      const out = new DN([uiLanguage], { type: 'language' }).of(code);
      if (out) return out;
    }
  } catch {
    /* fall through */
  }
  return code.toUpperCase();
}

/** Comma-joined language names, or null when there are none. */
export function languageListLabel(
  codes: readonly string[] | null | undefined,
  uiLanguage: string,
): string | null {
  if (!codes?.length) return null;
  return codes.map((c) => languageDisplayName(c, uiLanguage)).join(', ');
}
