// Removal of machine code (CSS / JS) that leaks into news article bodies.
// Pure functions — no AI, no IO.
//
// Two distinct leaks, two distinct layers:
//
//   1. `stripRawTextElements` — the ROOT CAUSE. `stripHtmlTags` is a state machine
//      that emits every character outside a `<…>` tag, so `<style>#x{color:red}</style>`
//      loses the tags but KEEPS the stylesheet as visible prose. Same for `<script>`.
//      This pass deletes those elements *with their contents* before tag stripping.
//
//   2. `stripCodeResidue` — the CLEANUP layer. Articles committed before the fix
//      (and aggregator feeds that hand us text with the tags already gone) hold the
//      code as bare text with no tags left to key off. This pass finds brace blocks
//      whose body is a CSS declaration list or a JS statement list and removes them
//      together with their selector / function head.
//
// The residue scanner is deliberately conservative: a block is only removed when its
// body proves it is code (a `prop: value;` declaration or a JS keyword + operator) AND
// the run of tokens in front of the `{` looks like a selector or a function head.
// A bare prose word never qualifies as a head, so "…performance times. #wrap { … }"
// loses the rule and keeps the sentence.

// Elements whose text content is code/markup, never article prose.
const RAW_TEXT_TAGS = [
  'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'canvas', 'math',
] as const

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f'

// Remove `<script>`, `<style>` … elements INCLUDING their text content.
// Scanner rather than regex: keeps CodeQL's incomplete-multi-character-sanitization
// rule quiet and survives `>` inside CSS child combinators / JS comparisons.
export function stripRawTextElements(html: string): string {
  if (!html) return ''
  if (html.indexOf('<') === -1) return html
  const lower = html.toLowerCase()
  let out = ''
  let i = 0

  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) { out += html.slice(i); break }
    out += html.slice(i, lt)

    let tag = ''
    for (const t of RAW_TEXT_TAGS) {
      if (!lower.startsWith(t, lt + 1)) continue
      const next = lower[lt + 1 + t.length]
      // `<svg>` / `<svg ` / `<svg/>` match; `<span` must not match `s`+`…`.
      if (next === '>' || next === '/' || next === undefined || isSpace(next)) { tag = t; break }
    }
    if (!tag) { out += '<'; i = lt + 1; continue }

    const openEnd = html.indexOf('>', lt)
    if (openEnd === -1) { out += '<'; i = lt + 1; continue } // malformed — leave alone

    // Self-closing (`<svg … />`): drop the tag only, never the following text.
    if (html[openEnd - 1] === '/') { out += '\n'; i = openEnd + 1; continue }

    const close = lower.indexOf(`</${tag}`, openEnd)
    // Unterminated element: drop the opening tag only. Swallowing to end-of-input
    // would delete the whole article on a single stray `<script>`.
    if (close === -1) { out += '\n'; i = openEnd + 1; continue }

    const closeEnd = html.indexOf('>', close)
    out += '\n'
    i = closeEnd === -1 ? html.length : closeEnd + 1
  }

  return out
}

// Bare HTML element names that legitimately appear alone as a CSS selector.
const HTML_TAG_SELECTORS = new Set([
  'html', 'body', 'a', 'p', 'div', 'span', 'strong', 'em', 'b', 'i', 'u', 'small',
  'img', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'form',
  'input', 'button', 'select', 'textarea', 'label', 'section', 'article', 'aside',
  'header', 'footer', 'nav', 'main', 'figure', 'figcaption', 'blockquote', 'pre',
  'code', 'hr', 'br', 'iframe', 'video', 'audio', 'canvas', 'svg', 'picture',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
])

// JS keywords that can stand ALONE immediately before a `{` — every other block
// keyword (`if`, `for`, `while`, `function`, `catch`, `switch`) is separated from
// its brace by `)`, which the "ends with )" rule already covers.
//
// Deliberately tiny: `for`, `in`, `of`, `new`, `return`, `case`, `do` are ordinary
// English words. Accepting them here let the head walk-back chew a whole sentence
// off the end of an article ("See here for the full … lineup and performance times."
// disappeared in front of Attitude's injected stylesheet). Even this set is only
// honoured in the FIRST position, directly against the brace.
const JS_BARE_HEAD_WORDS = new Set(['else', 'try', 'finally'])

// A CSS selector token: a chain of simple selectors, optionally comma-terminated.
// Written strictly — `.` and `#` MUST be followed by an identifier character — so a
// prose word ending in a full stop ("times.") can never be mistaken for a class.
const CSS_SELECTOR = new RegExp(
  '^(?:\\*|[A-Za-z][A-Za-z0-9_-]*|[#.][A-Za-z_][A-Za-z0-9_-]*|\\[[^\\]]+\\])' +
  '(?:[#.][A-Za-z_][A-Za-z0-9_-]*|\\[[^\\]]+\\]|::?[A-Za-z-]+(?:\\([^)]*\\))?|' +
  '[>+~](?:\\*|[A-Za-z][A-Za-z0-9_-]*|[#.][A-Za-z_][A-Za-z0-9_-]*)?)*,?$',
)
// Without a structural marker the token is just a word, so it only counts when it
// names a real element.
const HAS_SELECTOR_MARKER = /[#.[\]:>+~*]/

// Does this whitespace-delimited token belong to a CSS selector or a JS block head?
// Plain prose words deliberately do NOT qualify — that is what stops the walk-back
// from eating the sentence in front of an injected stylesheet.
function isHeadToken(tok: string, first: boolean): boolean {
  if (!tok || tok.length > 120) return false
  // A word carrying sentence punctuation is prose, never a selector.
  if (/[.!?…]$/.test(tok) && !/^[#.][A-Za-z_]/.test(tok)) return false
  if (/[“”‘’«»]/.test(tok)) return false

  // JS: `(function`, `})`, `=>`, `x.y =`, `!function(a,b)`
  if (first && JS_BARE_HEAD_WORDS.has(tok.replace(/[(){}!,;]/g, '').toLowerCase())) return true
  if (/function\s*\(?/.test(tok)) return true
  if (tok === '=>' || tok.endsWith('=') || tok.endsWith('=>')) return true
  // A parenthesised token only counts as a block head when it carries code inside it.
  // A bare "(2024)" after a film title is prose — accepting it stripped the year off
  // every entry in a "50 best films" list that had a video embed after each title.
  if (tok.endsWith(')') || tok.endsWith('(')) {
    if (/^[)(};,.]*$/.test(tok)) return true                       // `)`, `})`, `});`
    if (/[{}=;"'`]|\.[A-Za-z_$]/.test(tok)) return true            // member access / literals
    if (/^(?:if|for|while|switch|catch|function)\s*\(/i.test(tok)) return true
    return false
  }

  // CSS combinators / universal selector on their own.
  if (/^[>+~*],?$/.test(tok)) return true

  // At-rule (`@media`, `@supports`, `@keyframes`).
  if (/^@[A-Za-z-]+$/.test(tok)) return true

  if (!CSS_SELECTOR.test(tok)) return false
  if (HAS_SELECTOR_MARKER.test(tok)) return true
  return HTML_TAG_SELECTORS.has(tok.replace(/,$/, '').toLowerCase())
}

// An at-rule prelude fragment (`(max-width:`, `480px)`) sits between the `@media`
// keyword and the `{`. Accepted only while hunting backwards for the `@`, and only
// when it carries prelude punctuation or is a media keyword — a bare prose word
// must never qualify.
const AT_PRELUDE_WORDS = new Set(['and', 'or', 'not', 'only', 'screen', 'print', 'all', 'speech'])
const isPreludeFragment = (tok: string) =>
  AT_PRELUDE_WORDS.has(tok.toLowerCase()) ||
  (/^[A-Za-z0-9_.%()<>=:+*/-]+$/.test(tok) && /[():]/.test(tok))

// A CSS declaration anchored to the start of its declaration and terminated by `;`.
// Both anchors matter: `{Editor's Note: several links have been added…}` is prose in
// braces (a house style on two of the sources) and satisfies a loose `word: text`
// pattern, but never `; prop: value;`.
const CSS_DECLARATION = /(?:^|[;{])\s*[a-z-]{2,}\s*:\s*[^;{}]{1,300};/
// Narrow JS signatures — a bare `new`/`return`/`this` inside a sentence must not count.
const JS_STATEMENT = [
  /\b(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=/,
  /\bfunction\s*[A-Za-z_$\w]*\s*\(/,
  /\b(?:window|document|console|navigator)\s*\.\s*[A-Za-z_$]/,
  /=>\s*[{(]/,
  /\breturn\s*[!A-Za-z_$(][^;]{0,80};/,
  /\btypeof\s+[A-Za-z_$]/,
]

// `{ elemId: 'video-…', data: {…}, videoPlayerType: 'in-content' }` — an object
// literal passed to an embed call. Only trusted together with a confirmed head.
const OBJECT_LITERAL =
  /^\s*(?:"[^"]{1,60}"|'[^']{1,60}'|[A-Za-z_$][\w$]*)\s*:\s*(?:["'{[]|null|true|false|-?\d)/

// `window.videoEmbeds.push(` / `PARSELY = ` — a call argument or assignment position.
const CALL_OR_ASSIGN_HEAD = /(?:[A-Za-z_$][\w$]*\s*\(|=)\s*$/

function bodyIsCode(body: string): boolean {
  const t = body.trim()
  if (!t) return false
  if (JS_STATEMENT.some((re) => re.test(t))) return true
  return CSS_DECLARATION.test(t)
}

// Walk left from `open` over whitespace-delimited tokens for as long as they look
// like a selector / block head. Returns the index the removal should start at.
function headStart(text: string, open: number): number {
  let start = open
  let i = open
  // Tokens accepted only provisionally, while hunting backwards for an `@media`
  // keyword. Discarded if no at-rule turns up — an at-rule prelude fragment on its
  // own ("(max-width:") is not evidence of code.
  let confirmed = open
  let prevWasAssign = false
  for (let tokens = 0; tokens < 12; tokens++) {
    let j = i - 1
    while (j >= 0 && isSpace(text[j])) j--
    if (j < 0) break
    // A statement boundary ends the head.
    if (text[j] === ';' || text[j] === '}' || text[j] === '{') break
    let k = j
    while (k >= 0 && !isSpace(text[k])) k--
    const tok = text.slice(k + 1, j + 1)

    // `PARSELY = { … }` — the identifier left of an `=` we already accepted.
    const isAssignTarget = prevWasAssign && /^[A-Za-z_$][\w$.[\]'"]*$/.test(tok)

    if (isHeadToken(tok, tokens === 0) || isAssignTarget) {
      start = k + 1
      confirmed = start
      prevWasAssign = tok.endsWith('=')
      if (tok.startsWith('@')) break // at-rule keyword — head complete
    } else if (isPreludeFragment(tok)) {
      // Provisional: only kept if an `@media`-style keyword turns up further left.
      start = k + 1
      prevWasAssign = false
    } else {
      break
    }
    i = k + 1
  }
  return confirmed
}

// Consume the trailing `)`, `;`, `,` of an IIFE (`})();`) after the closing brace.
function tailEnd(text: string, close: number): number {
  let i = close + 1
  let budget = 12
  while (i < text.length && budget-- > 0) {
    const c = text[i]
    if (c === ')' || c === ';' || c === ',' || c === '(') { i++; continue }
    if (isSpace(c)) { i++; continue }
    break
  }
  // Do not swallow whitespace that separates the next sentence.
  while (i > close + 1 && isSpace(text[i - 1])) i--
  return i
}

function removeOnce(text: string): string {
  const stack: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '{') { stack.push(i); continue }
    if (c !== '}') continue
    const open = stack.pop()
    if (open === undefined) continue

    const body = text.slice(open + 1, i)
    const start = headStart(text, open)
    const hasHead = start < open
    // Innermost blocks must prove they are code. A confirmed head weakens the burden:
    // an emptied wrapper left by a previous pass (`@media (…) {  }`, `(function () {  })`),
    // an object literal, or a call/assignment position all count once a head is present.
    const headText = text.slice(start, open)
    // The call/assign branch additionally demands code punctuation in the body:
    // inline LaTeX (`\(O({n}^{3})\)`) puts a `{` straight after `(`, which reads as a
    // call position, and a science paper is full of them.
    const callArg = CALL_OR_ASSIGN_HEAD.test(headText) &&
      body.trim().length >= 12 && /[:;=]/.test(body)
    const proven = bodyIsCode(body) ||
      (hasHead && (!body.trim() || OBJECT_LITERAL.test(body) || callArg))
    if (!proven) continue

    return text.slice(0, start) + ' ' + text.slice(tailEnd(text, i))
  }
  return text
}

export interface CodeResidueResult {
  text: string
  removed: boolean
}

// Strip CSS rule blocks and JS statement blocks left in already-tag-stripped text.
export function stripCodeResidue(input: string): CodeResidueResult {
  if (!input || input.indexOf('{') === -1) return { text: input ?? '', removed: false }
  let out = input
  // Innermost-first: each pass peels one block, so nested rules (`@media { .x { } }`)
  // and nested JS bodies collapse from the inside out.
  for (let pass = 0; pass < 60; pass++) {
    const next = removeOnce(out)
    if (next === out) break
    out = next
  }
  if (out === input) return { text: input, removed: false }
  // Tidy the punctuation a removed block leaves behind.
  out = out
    .replace(/[ \t]*;[ \t]*(?=;)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
  return { text: out, removed: true }
}

// Detector for monitoring + gating. Reports code that is STILL present after the
// stripper has run, i.e. a leak shape the scrubber does not yet understand.
export function detectCodeResidue(text: string): boolean {
  if (!text) return false
  if (/!important/.test(text)) return true
  if (/@media\s*(?:only\s+)?(?:screen|all|print|\()/i.test(text)) return true
  if (/\{[^{}]{0,400}[A-Za-z-]{2,}\s*:\s*[^;{}]{1,200};[^{}]{0,400}\}/.test(text)) return true
  if (/\b(?:document\.(?:getElementById|querySelector|createElement|write)|window\.(?:location|dataLayer|ShopifyBuy)|googletag|adsbygoogle|GoogleAnalyticsObject)\b/.test(text)) return true
  if (/\bfunction\s*\([^)]{0,120}\)\s*\{/.test(text)) return true
  return false
}
