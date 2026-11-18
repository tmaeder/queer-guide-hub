import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
const limit = 18000
const omitted = ' [Source text omitted beyond the 18000-character evidence limit.]'
const bounded = (value: string) => value.length > limit
  ? value.slice(0, limit - omitted.length) + omitted : value

/** Extract public page content within the caller's existing response/text bounds. */
export function readableSource(body: string, contentType: string): string {
  if (!/^text\/html(?:\s*;|\s*$)/i.test(contentType.trim())) return bounded(normalize(body))

  const $ = cheerio.load(body)
  const title = normalize($('title').first().text())
  // Event dates and business addresses often live in head JSON-LD, outside main.
  const structured = $('script').toArray()
    .filter(el => /^application\/ld\+json(?:\s*;|\s*$)/i.test(($(el).attr('type') ?? '').trim()))
    .map(el => normalize($(el).text())).filter(Boolean).join(' ')
  $('script, style, noscript, template, iframe, svg, nav, [role="navigation"], [hidden], [aria-hidden="true"]').remove()
  // DOM text() joins adjacent block elements; retain their word boundaries.
  $('br').replaceWith(' ')
  $('p, div, section, article, li, h1, h2, h3, h4, h5, h6, tr, td, th, dt, dd').append(' ')

  const mains = $('main, [role="main"]').toArray()
    .map(el => normalize($(el).text())).filter(text => text.length >= 100)
    .sort((a, b) => b.length - a.length)
  const content = mains[0] ?? normalize($('body').text())
  // An operator's contact address can be in the site footer rather than its main.
  const footer = mains.length ? normalize($('footer').text()) : ''
  return bounded([title, structured, content, footer].filter(Boolean).join(' '))
}
