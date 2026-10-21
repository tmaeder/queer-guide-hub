import {
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderEmailTemplate } from "./email-render.ts";
Deno.test("one renderer escapes HTML while retaining literal plain text and replacement characters", () => {
  const result = renderEmailTemplate({
    subject: "Hi {{name}}",
    html_content: "<p>{{name}}</p>",
    text_content: "{{name}}",
  }, { name: "<img src=x> $& $`" });
  assertEquals(result.subject, "Hi <img src=x> $& $`");
  assertEquals(result.html, "<p>&lt;img src=x&gt; $&amp; $`</p>");
  assertEquals(result.text, "<img src=x> $& $`");
});
Deno.test("missing tokens and header injection prevent a broken or unsafe message", () => {
  assertThrows(() =>
    renderEmailTemplate({ subject: "Hi", html_content: "{{missing}}" }, {})
  );
  assertThrows(() =>
    renderEmailTemplate({ subject: "{{name}}", html_content: "Hello" }, {
      name: "Hello\r\nBcc: other@example.com",
    })
  );
  assertThrows(() =>
    renderEmailTemplate({ subject: "Hi", html_content: "{{constructor}}" }, {})
  );
  assertEquals(
    renderEmailTemplate({
      subject: "Hi",
      html_content: "{{optional}}",
      variables: [{ name: "optional", required: false }],
    }, {}).html,
    "",
  );
});
Deno.test("link variables require HTTPS and cannot smuggle active schemes", () => {
  assertThrows(() =>
    renderEmailTemplate({
      subject: "Hi",
      html_content: '<a href="{{claim_url}}">Go</a>',
    }, { claim_url: "javascript:alert(1)" })
  );
  assertThrows(() =>
    renderEmailTemplate({
      subject: "Hi",
      html_content: '<a href="{{link}}">Go</a>',
    }, { link: "java\nscript:alert(1)" })
  );
  for (
    const control of [
      String.fromCharCode(0),
      String.fromCharCode(31),
      String.fromCharCode(127),
    ]
  ) {
    assertThrows(() =>
      renderEmailTemplate({ subject: "Hi", html_content: "{{link}}" }, {
        link: `java${control}script:alert(1)`,
      })
    );
  }
  assertStringIncludes(
    renderEmailTemplate({
      subject: "Hi",
      html_content: '<a href="{{claim_url}}">Go</a>',
    }, { claim_url: "https://queer.guide/claim?a=1&b=2" }).html,
    "a=1&amp;b=2",
  );
});
Deno.test("HTML-only templates produce useful plain text including link targets", () => {
  const result = renderEmailTemplate({
    subject: "Hi",
    html_content: '<p>Visit <a href="https://queer.guide">Queer Guide</a></p>',
  }, {});
  assertStringIncludes(result.text, "https://queer.guide");
  assertStringIncludes(result.text, "Visit");
});
