const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  deg: '°',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  agrave: 'à',
  aacute: 'á',
  auml: 'ä',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  iacute: 'í',
  ntilde: 'ñ',
  oacute: 'ó',
  ouml: 'ö',
  szlig: 'ß',
  uacute: 'ú',
  uuml: 'ü',
};

/**
 * Decode the HTML entities that leak through scraped/RSS titles and excerpts
 * (numeric always; named via the table above — the typographic + Latin-1 set
 * WordPress feeds actually emit). Regex-based and DOM-free so it also runs in
 * tests/workers. The single shared decoder — the former textarea-innerHTML
 * copy in utils/htmlDecode duplicated it under the same name.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}
