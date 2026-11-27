import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { applyNewsSourceLayout, newsSourceLayout } from './source-layout.ts'
import { cleanNewsBody, cleanNewsText, newsTextIssues } from './text-cleanup.ts'
import { extractArticle } from './extract.ts'

Deno.test('related cards require both a heading and a tracking link; reporting survives', () => {
  const prose = 'The editor said Related is a common label in publishing.'
  const html = `<p>${prose}</p><blockquote><h3>Related</h3><p><a href="/other?utm_medium=related_links">Another headline</a><br>A teaser for another story.</p></blockquote><p>The actual reporting continues here.</p>`
  const layout = newsSourceLayout(html, true)
  assertEquals(layout.noise, ['Related Another headline A teaser for another story.'])
  const current = `${prose} Related Another headline A teaser for another story. The actual reporting continues here.`
  assertEquals(applyNewsSourceLayout(current, layout), `${prose}\n\nThe actual reporting continues here.`)
  assertEquals(cleanNewsText(html), `${prose}\n\nThe actual reporting continues here.`)
  assertStringIncludes(cleanNewsText('<blockquote><h3>Related</h3><p>An actual quotation without a widget link.</p></blockquote>'), 'An actual quotation')
})

Deno.test('embedded social quotation survives; only media link and embed footer are removed', () => {
  const html = '<p>Before the quotation.</p><blockquote class="twitter-tweet"><p>Words worth preserving. <a href="https://t.co/abc">pic.twitter.com/abc</a></p>— A Person (@example) November 25, 2026</blockquote><p>Reporting after the quotation.</p>'
  const source = newsSourceLayout(html, true)
  const current = 'Before the quotation. Words worth preserving. pic.twitter.com/abc — A Person (@example) November 25, 2026 Reporting after the quotation.'
  assertEquals(applyNewsSourceLayout(current, source), 'Before the quotation.\n\nWords worth preserving.\n\nReporting after the quotation.')
})

Deno.test('photo credit is removed by source evidence, not a broad phrase match', () => {
  const source = newsSourceLayout('<header><div class="at-article__hero">A Person (Image: Photographer)</div></header><p>Actual reporting about Image: a new exhibition.</p>', true)
  assertEquals(applyNewsSourceLayout('A Person (Image: Photographer) Actual reporting about Image: a new exhibition.', source), 'Actual reporting about Image: a new exhibition.')
})

Deno.test('recover all feed boundaries even when first two breaks already exist', () => {
  const raw = 'First reporting paragraph.\n\nSecond reporting paragraph.\n\nThird reporting paragraph. Fourth reporting paragraph.'
  const source = 'First reporting paragraph.\n\nSecond reporting paragraph.\n\nThird reporting paragraph.\n\nFourth reporting paragraph.'
  assertEquals(cleanNewsBody(raw, source), source)
  assertEquals(cleanNewsBody(source, source), source)
})

Deno.test('source changes cannot replace, add, or reorder publisher wording', () => {
  const current = 'An editor changed this paragraph. Next paragraph stays exactly the same. Final reporting remains.'
  const source = {blocks:['The old paragraph was different.', 'Next paragraph stays exactly the same.', 'New publisher material was added.'], noise:[]}
  const repaired = applyNewsSourceLayout(current, source)
  assertEquals(repaired.replace(/\s+/g,' '), current)
  assertStringIncludes(repaired, '\n\nNext paragraph stays exactly the same.\n\n')
})

Deno.test('ambiguous repeated blocks do not authorize guessed breaks', () => {
  const current = 'Repeated reporting sentence. Some intervening words. Repeated reporting sentence.'
  assertEquals(applyNewsSourceLayout(current, {blocks:['Repeated reporting sentence.'],noise:[]}), current)
})

Deno.test('exact widget matches preserve quoted mentions and adjacent prose', () => {
  const source = {blocks:[],noise:['Subscribe to the example newsletter']}
  assertEquals(applyNewsSourceLayout('She said “Subscribe to the example newsletter” yesterday.', source), 'She said “Subscribe to the example newsletter” yesterday.')
  assertEquals(applyNewsSourceLayout('First reporting. Subscribe to the example newsletter Next reporting.', source), 'First reporting.  Next reporting.')
})

Deno.test('normalization is idempotent with unicode and HTML entities', () => {
  const current = '¿Quién cuida? «Une citation» remains unchanged. Final paragraph.'
  const layout = newsSourceLayout('<p>¿Quién cuida?</p><p>«Une citation» remains unchanged.</p><p>Final paragraph.</p>', true)
  const repaired = applyNewsSourceLayout(current, layout)
  assertEquals(repaired.replace(/\s+/g,' '),current)
  assertEquals(applyNewsSourceLayout(repaired,layout),repaired)
})

Deno.test('publisher promotion is removed as a standalone block and leftovers flag review', () => {
  assertEquals(cleanNewsText('Reporting first.\n\nGet our breaking news email, free app or daily news podcast\n\nReporting last.'),'Reporting first.\n\nReporting last.')
  assertEquals(newsTextIssues('Related\n\nAnother headline.').includes('source_widget_residue'),true)
  assertEquals(newsTextIssues('A post pic.twitter.com/xyz').includes('source_widget_residue'),true)
})

Deno.test('JSON-LD wording uses matching DOM paragraph boundaries without taking changed DOM prose', () => {
  const a='Original paragraph with reporting and exact wording that remains untouched. '.repeat(3).trim()
  const b='Another original paragraph with quotations and factual reporting.'.repeat(3)
  const body=a+' '+b
  const html=`<html><script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',articleBody:body})}</script><article><p>${a}</p><p>${b}</p></article></html>`
  const extracted=extractArticle(html,'https://example.com/story')
  assertEquals(extracted.method,'jsonld')
  assertEquals(extracted.content,a+'\n\n'+b)
})

Deno.test('a quoted newsletter link is reporting, not a newsletter widget', () => {
  const html='<blockquote><p>She wrote about the community in <a href="https://example.org/newsletter/">her newsletter</a>.</p></blockquote>'
  const source=newsSourceLayout(html,true)
  assertEquals(source.noise,[])
  assertEquals(source.blocks,['She wrote about the community in her newsletter.'])
})

Deno.test('a descriptive image caption is not discarded with its photographer credit', () => {
 const source=newsSourceLayout('<figure><figcaption>A crowd gathered outside parliament. Photo: A Photographer.</figcaption></figure><p>Reporting continues here.</p>',true)
 assertEquals(source.noise,[])
 assertStringIncludes(applyNewsSourceLayout('A crowd gathered outside parliament. Photo: A Photographer. Reporting continues here.',source),'A crowd gathered outside parliament. Photo: A Photographer.')
})

Deno.test('publisher newsletter footers are removed while reporting links remain', () => {
 const source=newsSourceLayout('<p>Reporting ends here.</p><p>Subscribe to the <a href="/newsletter/">Example newsletter</a> for updates.</p><p>Learn more about the community archive and donate here.</p>',true)
 assertEquals(source.noise,['Subscribe to the Example newsletter for updates.'])
 assertStringIncludes(applyNewsSourceLayout('Reporting ends here. Subscribe to the Example newsletter for updates. Learn more about the community archive and donate here.',source),'Learn more about the community archive and donate here.')
})
Deno.test('topic labels require a multi-item trailing UI suffix', () => {
 const source={blocks:[],noise:[],tailNoise:['Sydney','LGBTQ+ rights','news']}
 assertEquals(applyNewsSourceLayout('Reporting about Sydney ends here. Sydney LGBTQ+ rights news',source),'Reporting about Sydney ends here.')
 assertEquals(applyNewsSourceLayout('Reporting ends with important news',source),'Reporting ends with important news')
 assertEquals(applyNewsSourceLayout('Sydney LGBTQ+ rights news is the subject of this reporting.',source),'Sydney LGBTQ+ rights news is the subject of this reporting.')
})
Deno.test('a French RSS attribution footer is removed only at the end', () => {
 assertEquals(cleanNewsText('La conclusion originale.\n\nL’article Exemple est apparu en premier sur Fugues.'),'La conclusion originale.')
 assertStringIncludes(cleanNewsText('L’article Exemple est apparu en premier sur Fugues.\n\nLa suite du reportage.'),'L’article Exemple')
})
Deno.test('HTML article metadata can identify a publisher app panel without changing article wording', () => {
 const widget='<div id="att-unique-wrapper-2026"><span>Get more <strong>Attitude</strong></span> <a class="att-link-btn" href="/print">Subscribe in print</a> <a class="att-link-btn" href="/ios">iOS app</a> <a class="att-link-btn" href="/android">Android app</a></div>'
 const html=`<script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',articleBody:'<p>The real conclusion remains.</p>'+widget})}</script>`
 const source=newsSourceLayout(html)
 assertEquals(applyNewsSourceLayout('The real conclusion remains. Get more Attitude Subscribe in print iOS app Android app',source),'The real conclusion remains.')
})

Deno.test('HTML JSON-LD bodies are cleaned before exact source widget matching', () => {
 const words='Publisher reporting with an original quotation and unchanged wording. '.repeat(5).trim()
 const widget='<div id="att-unique-wrapper-2026"><span>Get more <strong>Attitude</strong></span> <a class="att-link-btn" href="/print">Subscribe in print</a> <a class="att-link-btn" href="/ios">iOS app</a> <a class="att-link-btn" href="/android">Android app</a></div>'
 const html=`<script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',articleBody:'<p>'+words+'</p>'+widget})}</script>`
 assertEquals(extractArticle(html,'https://example.org/story').content,words)
 assertEquals(cleanNewsText('a_handle preserves its > comparison and 5 < 9.'),'a_handle preserves its > comparison and 5 < 9.')
})
