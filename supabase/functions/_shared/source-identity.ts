/** Provider identities prevent aliases or repeated scrapes from adding votes. */
export function providerKey(source: string): string {
  const key = source.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (/^google(_places|_maps|maps)?$/.test(key)) return 'google'
  if (/^open_?street_?map$|^osm$/.test(key)) return 'osm'
  if (/^(gpt|openai|claude|anthropic|gemini|llm)(_|$)/.test(key)) return 'llm'
  return key || 'unknown'
}
