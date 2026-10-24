/**
 * The ONE place DOMPurify is configured. Every HTML sink sanitizes through a
 * named profile here; importing `dompurify` anywhere else is an ESLint error
 * (`queerguide/no-direct-dompurify`).
 *
 * Each profile reproduces the config its caller used before consolidation,
 * byte for byte — a profile is a contract with one surface, so widening one
 * to serve a second caller is a policy change and belongs in its own diff.
 *
 * The user-content profile carries an anchor hook. DOMPurify hooks are GLOBAL
 * to an instance, and the hook used to be installed on the shared default
 * instance the first time a post rendered — after which it silently applied to
 * every other caller in the session, so their output depended on what the user
 * had looked at earlier. It now lives on a private instance, so every other
 * profile behaves the same regardless of render order.
 */
import DOMPurify, { type Config, type DOMPurify as Purifier } from 'dompurify';

const ACTIVE_CONTENT = ['script', 'iframe', 'object', 'embed'];

/** Editor documents: keep `<style>`, drop anything that runs, submits or rebases. */
const DOCUMENT_FORBID = [
  ...ACTIVE_CONTENT,
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'base',
  'meta',
];

const EMAIL_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'code',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'div',
  'span',
  'hr',
];

let userContentPurifier: Purifier | null = null;
function userContentInstance(): Purifier {
  if (userContentPurifier) return userContentPurifier;
  const purifier = DOMPurify(window);
  purifier.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.nodeName.toLowerCase() !== 'a') return;
    const href = node.getAttribute('href') || '';
    if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href)) node.removeAttribute('href');
    const target = node.getAttribute('target');
    if (target === '_blank') node.setAttribute('rel', 'noopener noreferrer nofollow ugc');
    else if (target) node.removeAttribute('target');
  });
  userContentPurifier = purifier;
  return purifier;
}

const run = (html: string, config: Config): string => DOMPurify.sanitize(html, config) as string;

/** Remove every tag, keep the text. */
export const sanitizeToText = (html: string): string =>
  run(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

/** Posts and comments: a caller-chosen inline allowlist, https/relative links only. */
export function sanitizeUserContent(
  html: string,
  allowedTags: string[] = ['p', 'br', 'strong', 'em', 'u'],
  allowedAttrs: string[] = ['class', 'id', 'title'],
): string {
  return userContentInstance().sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttrs,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'iframe', 'style'],
    FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur', 'style'],
    ALLOWED_URI_REGEXP: /^(?:https:|\/|#)/i,
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
    KEEP_CONTENT: false,
  }) as string;
}

/** Search highlights: `<em>` and nothing else. */
export const sanitizeHighlight = (html: string): string =>
  run(html, { ALLOWED_TAGS: ['em'], ALLOWED_ATTR: [] });

/** CMS pages and tag wiki bodies: DOMPurify defaults, plus heading ids for deep links. */
export const sanitizeArticle = (html: string): string => run(html, { ADD_ATTR: ['id'] });

/** Legacy `/page/:slug` bodies: DOMPurify defaults. */
export const sanitizeDefault = (html: string): string => run(html, {});

/** Inbound email bodies shown in the inbox. */
export const sanitizeInboundEmail = (html: string): string =>
  run(html, {
    ALLOWED_TAGS: EMAIL_TAGS,
    ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'class', 'target', 'rel'],
  });

/** Admin email review: nothing may execute, navigate or load a resource. */
export const sanitizeEmailReview = (html: string): string =>
  run(html, {
    FORBID_TAGS: [...ACTIVE_CONTENT, 'form', 'link', 'meta', 'base'],
    FORBID_ATTR: ['src', 'srcset', 'href', 'action', 'background', 'poster'],
  });

/** Outgoing email body: whole document, `<style>` kept so the head can be lifted. */
export const sanitizeEmailDocument = (html: string): string =>
  run(html, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style'] });

/** Legacy email HTML being converted to blocks: inline styles kept, style blocks dropped. */
export const sanitizeLegacyEmail = (html: string): string =>
  run(html, { ADD_ATTR: ['style'], FORBID_TAGS: ['style', 'script'] });

/** Rendered-email editor (preview and edits). */
export const sanitizeEditableDocument = (html: string, wholeDocument: boolean): string =>
  run(html, { WHOLE_DOCUMENT: wholeDocument, ADD_TAGS: ['style'], FORBID_TAGS: DOCUMENT_FORBID });

/** CMS field summaries: parsed for their text, so only active content must go. */
export const sanitizeForSummary = (html: string): string =>
  run(html, { FORBID_TAGS: [...ACTIVE_CONTENT, 'style'] });

/** Inline SVG from a `data:` URL in the media library. */
export const sanitizeSvg = (svg: string): string =>
  run(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover'],
  });
