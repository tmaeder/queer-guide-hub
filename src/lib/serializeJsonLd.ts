/**
 * JSON.stringify for a value that will be placed inside a <script> element
 * via dangerouslySetInnerHTML. `<`, `>` and `&` become \u escapes, which JSON
 * parsers decode back to the same characters, so `</script>` in data cannot
 * close the element. Mirrors escapeJsonLd in functions/_lib/jsonLd.ts.
 *
 * Not needed when writing script.textContent (useMeta, BreadcrumbBar) —
 * textContent never parses markup.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
