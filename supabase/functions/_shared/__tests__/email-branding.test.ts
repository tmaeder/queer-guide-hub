import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  MESSAGE_CLASSES,
  fromHeader,
  toPlainText,
  wrapHtml,
  type EmailBranding,
} from '../branding.ts';

const BRANDING: EmailBranding = {
  from_name: 'The Queer Guide',
  from_address: 'noreply@queer.guide',
  wrapper_bg: '#EDEDE6',
  wrapper_fg: '#111111',
};

Deno.test('fromHeader is the RFC 5322 display form', () => {
  assertEquals(fromHeader(BRANDING), 'The Queer Guide <noreply@queer.guide>');
});

Deno.test('the shell is ink on paper, not the pre-rebrand dark theme', () => {
  const html = wrapHtml('<p>hi</p>', BRANDING);
  assertStringIncludes(html, '#EDEDE6'); // frame
  assertStringIncludes(html, '#FAFAF5'); // paper card
  assert(!html.includes('#0a0a0a'), 'the dark wrapper must be gone');
});

Deno.test('layout is tables — flex/grid never survive Outlook', () => {
  const html = wrapHtml('<p>hi</p>', BRANDING);
  assertStringIncludes(html, '<table');
  assert(!/display\s*:\s*(flex|grid)/i.test(html), 'no flex/grid in the shell');
});

Deno.test('no gradients, no shadows, no background images', () => {
  const html = wrapHtml('<p>hi</p>', BRANDING, {
    subject: 'welcome',
    action: { label: 'Open', url: 'https://queer.guide/x' },
  });
  assert(!/gradient/i.test(html), 'no gradients');
  assert(!/box-shadow/i.test(html), 'no shadows');
  assert(!/background-image/i.test(html), 'no background images');
});

Deno.test('each message class contributes its own accent, and only one', () => {
  for (const [key, cls] of Object.entries(MESSAGE_CLASSES)) {
    const html = wrapHtml('<p>hi</p>', BRANDING, { messageClass: key as keyof typeof MESSAGE_CLASSES });
    assertStringIncludes(html, cls.accent);
    // The other three must NOT appear: one accent per message.
    for (const [otherKey, other] of Object.entries(MESSAGE_CLASSES)) {
      if (otherKey === key) continue;
      assert(!html.includes(other.accent), `${key} leaked ${otherKey}'s accent`);
    }
  }
});

Deno.test('body text is never set on a track colour', () => {
  // Three of the four accents fail contrast against paper as text. The accent
  // may only ever be a rule, so it must not appear as a `color:`.
  for (const cls of Object.values(MESSAGE_CLASSES)) {
    const html = wrapHtml('<p>hi</p>', BRANDING, { subject: 's' });
    // `background-color:#X` CONTAINS `color:#X`, so a substring check here is
    // a false positive that passes no matter what. Anchor on the declaration.
    assert(
      !new RegExp(`(?<!background-)color:${cls.accent}`, 'i').test(html),
      'accent used as a text colour',
    );
  }
});

Deno.test('unsubscribe is offered ONLY for the bulk class', () => {
  const url = 'https://queer.guide/unsub?t=1';
  const digest = wrapHtml('<p>hi</p>', BRANDING, { messageClass: 'digest', unsubscribeUrl: url });
  assertStringIncludes(digest, url);

  // Transactional classes must not promise an unsubscribe the product will
  // not honour — an account mail is delivered regardless.
  for (const key of ['account', 'receipt', 'contribution'] as const) {
    const html = wrapHtml('<p>hi</p>', BRANDING, { messageClass: key, unsubscribeUrl: url });
    assert(!html.includes(url), `${key} must not offer unsubscribe`);
  }
});

Deno.test('an unknown/omitted class defaults to account, the safest', () => {
  const html = wrapHtml('<p>hi</p>', BRANDING, { unsubscribeUrl: 'https://x.test/u' });
  assertStringIncludes(html, MESSAGE_CLASSES.account.accent);
  // Assert on the LINK, not on a bare substring of the URL — a substring can
  // match inside an unrelated href and the check would pass by accident
  // (CodeQL js/incomplete-url-substring-sanitization).
  assert(!/href=["']https:\/\/x\.test\/u["']/.test(html), 'default class must not be treated as bulk');
});

Deno.test('the footer band carries reason and postal address', () => {
  const html = wrapHtml('<p>hi</p>', BRANDING, {
    reason: 'You get this because you saved a trip.',
    preferencesUrl: 'https://queer.guide/profile/settings',
  });
  assertStringIncludes(html, 'You get this because you saved a trip.');
  assertStringIncludes(html, 'Z&uuml;rich'.replace('&uuml;', 'ü'));
  assertStringIncludes(html, 'Email preferences');
});

Deno.test('user content is escaped into the shell', () => {
  const html = wrapHtml('<p>ok</p>', BRANDING, { subject: '<script>alert(1)</script>' });
  assert(!html.includes('<script>'), 'subject must be escaped');
  assertStringIncludes(html, '&lt;script&gt;');
});

Deno.test('plain text keeps link targets and block breaks', () => {
  const text = toPlainText('<p>Hello</p><p>See <a href="https://queer.guide/e/1">the event</a></p>');
  assertStringIncludes(text, 'the event (https://queer.guide/e/1)');
  // Blocks became newlines rather than one run-on paragraph.
  assert(text.split('\n').length > 1, 'block elements must break lines');
  assert(!text.includes('<p>'), 'tags stripped');
});

Deno.test('plain text mirrors the unsubscribe rule of the HTML', () => {
  const url = 'https://queer.guide/unsub?t=2';
  assertStringIncludes(toPlainText('<p>hi</p>', { messageClass: 'digest', unsubscribeUrl: url }), url);
  assert(
    !toPlainText('<p>hi</p>', { messageClass: 'receipt', unsubscribeUrl: url }).includes(url),
    'receipt must not offer unsubscribe in text either',
  );
});

Deno.test('plain text carries the action URL, which a label alone cannot', () => {
  const text = toPlainText('<p>hi</p>', { action: { label: 'Open trip', url: 'https://queer.guide/t/9' } });
  assertStringIncludes(text, 'Open trip: https://queer.guide/t/9');
});

// ── Regression tests for the three CodeQL findings ────────────────────────
// Each asserts the DEFECT is gone, not merely that the scanner is quiet.

Deno.test('entities are decoded once — no double-unescape', () => {
  // `&amp;lt;` must stay the literal text `&lt;`. Decoding `&amp;` first and
  // `&lt;` afterwards turned it into a real `<` (CodeQL js/double-escaping).
  const text = toPlainText('<p>&amp;lt;script&amp;gt;</p>');
  assertStringIncludes(text, '&lt;script&gt;');
  assert(!text.includes('<script>'), 'double-unescaped into a live tag');
});

Deno.test('nested tags are stripped to a fixed point', () => {
  // A single pass removes the inner match and closes the outer halves into a
  // live tag behind it (CodeQL js/incomplete-multi-character-sanitization).
  const text = toPlainText('<p><scr<script>ipt>alert(1)</p>');
  assert(!/<script/i.test(text), `still contains <script: ${text}`);
  assert(!/<[a-z]/i.test(text), `tag-like residue survived: ${text}`);
});

Deno.test('an unterminated tag start does not survive', () => {
  // Nothing in this string can close it, but whatever a caller concatenates
  // afterwards can.
  const text = toPlainText('<p>hello</p><script');
  assert(!text.includes('<script'), `unterminated tag survived: ${text}`);
});

Deno.test('style and script CONTENT never reaches the body', () => {
  const text = toPlainText('<style>.x{color:red}</style><script>alert(1)</script><p>real</p>');
  assertStringIncludes(text, 'real');
  assert(!text.includes('color:red'), 'style content leaked');
  assert(!text.includes('alert(1)'), 'script content leaked');
});
