/** Preserve incoming query/fragment unless the destination supplies its own. */
export function localizedRedirectTarget(
  to: string,
  prefix: string,
  source: { search: string; hash: string },
) {
  const target = new URL(to, 'https://queer.guide');
  return {
    pathname: `${prefix}${target.pathname}`,
    search: to.includes('?') ? target.search : source.search,
    hash: to.includes('#') ? target.hash : source.hash,
  };
}
