import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { decodeHtmlEntities } from './html-entities.ts'
import { cleanNewsText, newsHtmlToText } from './text-cleanup.ts'

import { type NewsSourceLayout } from './source-layout-core.ts'
export { applyNewsSourceLayout } from './source-layout-core.ts'
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

// Source HTML is evidence, not a replacement body. Feed fragments must opt in;
// whole pages use article containers so menus/comments cannot supply boundaries.
export function newsSourceLayout(html: string, fragment = false): NewsSourceLayout {
  const $ = cheerio.load(html)
  const noise: string[] = []
  const capture = (el: cheerio.Element) => {
    const text = flat(decodeHtmlEntities(newsHtmlToText($(el).html() ?? '')))
    if (text) noise.push(text)
    $(el).remove()
  }
  $('.at-article__hero').each((_, el) => capture(el))
  $('script,style,noscript,iframe,nav,header,footer,aside,form').remove()
  $('blockquote').each((_, el) => {
    const node = $(el)
    if ((/^Related(?: articles)?$/i.test(node.find('h3,h2').first().text().trim()) && node.find('a[href*="related_links"]').length) || node.find('a[href*="newsletter"]').toArray().some(a => /^Subscribe to our Newsletter today$/i.test($(a).text().trim()))) capture(el)
  })
  $('[class]').each((_, el) => {
    if (/\b(?:newsletter|related-articles|social-sharing|at-article__hero)\b/.test($(el).attr('class') ?? '')) capture(el)
  })
  // Preserve the quoted social post, discard only its media URL and the embed's
  // timestamp/handle footer outside the post paragraph.
  $('blockquote.twitter-tweet').each((_, el) => {
    const node = $(el)
    node.find('a').filter((_, a) => /^(?:https?:\/\/)?(?:pic\.twitter\.com|t\.co)\//.test($(a).text().trim())).each((_, a) => capture(a))
    const clone = node.clone(); clone.find('p').remove()
    const metadata = flat(clone.text())
    if (metadata) noise.push(metadata)
    node.contents().filter((_, child) => child.type !== 'tag' || child.tagName !== 'p').remove()
  })
  $('figcaption,.caption,.wp-caption-text').each((_, el) => {
    if (/\b(?:Image|Photo|Credit|Getty|Shutterstock)\b/i.test($(el).text())) capture(el)
  })
  $('p,li').each((_, el) => {
    if (/^Get our breaking news email, free app or daily news podcast$/.test(flat($(el).text()))) capture(el)
  })
  let root: ReturnType<typeof $> = $('body')
  if (!fragment) {
    const selectors = ['[itemprop="articleBody"]', '.article-body-commercial-selector', '.article-content', '.entry-content', '.td-post-content', 'article']
    for (const selector of selectors) {
      const nodes = $(selector).toArray().sort((a, b) => $(b).find('p').text().length - $(a).find('p').text().length)
      if (nodes[0] && $(nodes[0]).find('p').text().length >= 200) { root = $(selector).filter((_, el) => el === nodes[0]); break }
    }
    if (root.is('body')) return { blocks: [], noise: [] }
  }
  const blocks: string[] = []
  root.find('p,h1,h2,h3,h4,li').each((_, el) => {
    if ($(el).find('p,h1,h2,h3,h4,li').length) return
    const text = cleanNewsText($(el).html() ?? '')
    if (text) blocks.push(text)
  })
  return { blocks, noise }
}
