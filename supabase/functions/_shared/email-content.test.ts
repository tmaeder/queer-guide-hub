import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  catalogReferences,
  contactsCsv,
  loadEmailTemplate,
  publicCatalogBlocks,
} from "./email-content.ts";
import { managementForm } from "./email-management.ts";
Deno.test("public catalog references reject arbitrary tables, duplicates and unbounded requests", () => {
  const id = "55555555-0000-4000-8000-000000000001";
  assertEquals(catalogReferences([{ kind: "event", id }]), [{
    kind: "event",
    id,
  }]);
  for (
    const input of [
      [{ kind: "auth.users", id }],
      [{ kind: "event", id, url: "https://private.invalid" }],
      [{ kind: "event", id }, { kind: "event", id }],
      Array.from({ length: 13 }, () => ({ kind: "event", id })),
      [{ kind: "event", id: "arbitrary" }],
    ]
  ) assertEquals(catalogReferences(input), null);
});
Deno.test("public block resolution applies current visibility filters and escapes catalog titles", async () => {
  const calls: string[] = [];
  const client = {
    from: (table: string) => {
      calls.push(table);
      const q = {
        select: () => q,
        eq: (key: string, value: string) => {
          calls.push(`${key}:${value}`);
          return q;
        },
        is: (key: string) => {
          calls.push(`${key}:null`);
          return q;
        },
        neq: () => q,
        not: () => q,
        lte: () => q,
        gt: () => q,
        maybeSingle: async () => ({
          data: table === "events"
            ? { id: "fixture", slug: "safe/slash", title: "<img src=x> $&" }
            : null,
          error: null,
        }),
      };
      return q;
    },
  };
  const result = await publicCatalogBlocks(client as never, [{
    kind: "event",
    id: "55555555-0000-4000-8000-000000000001",
  }, { kind: "organization", id: "55555555-0000-4000-8000-000000000002" }]);
  assertEquals(calls.includes("status:active"), true);
  assertEquals(calls.includes("duplicate_of_id:null"), true);
  assertEquals(result.blocks[0].available, true);
  assertEquals(result.blocks[1].available, false);
  const block = result.blocks[0] as { html: string; url: string };
  assertStringIncludes(block.html, "&lt;img src=x&gt; $&amp;");
  assertEquals(new URL(block.url).hostname, "queer.guide");
  assertStringIncludes(block.url, "safe%2Fslash");
  assertEquals(result.dispatch_available, false);
});
Deno.test("CSV exports quote multiline cells and neutralize spreadsheet formulas", () => {
  const csv = contactsCsv([{
    email: "a@example.com",
    status: "pending",
    locale: "en",
    topics: [],
    source: '=HYPERLINK("bad")\nsource',
    confirmed_at: null,
  }]);
  assertStringIncludes(csv, '"\'=HYPERLINK(""bad"")\nsource"');
  assertStringIncludes(csv, '"pending"');
});
Deno.test("management forms are purpose-scoped, escaped and require explicit POST", () => {
  const form = managementForm("a".repeat(64), {
    status: "subscribed",
    topics: ["events"],
    locale: '"><script>bad()</script>',
  })!;
  assertStringIncludes(form, 'method="post"');
  assertStringIncludes(form, 'value="events" checked');
  assertEquals(form.includes("<script>"), false);
  assertEquals(form.includes('action="?action=manage'), true);
  const unsubscribed = managementForm("b".repeat(64), {
    status: "unsubscribed",
    topics: [],
    locale: "en",
  })!;
  assertEquals(unsubscribed.includes("Save these preferences"), false);
  assertStringIncludes(unsubscribed, "Unsubscribe from all updates");
  assertEquals(
    managementForm("<script>", {
      status: "subscribed",
      topics: [],
      locale: "en",
    }),
    null,
  );
});
Deno.test("template resolution exposes real fallback evidence and fails closed on lookup errors", async () => {
  const seen: unknown[] = [];
  const db = {
    rpc: async (name: string, args: unknown) => {
      seen.push({ name, args });
      return {
        data: {
          subject: "Hello",
          html_content: "<p>Hello</p>",
          resolved_locale: "base",
          fallback: true,
        },
        error: null,
      };
    },
  };
  const result = await loadEmailTemplate(db as never, "welcome", "de-CH");
  assertEquals(result.resolved_locale, "base");
  assertEquals(seen, [{
    name: "email_template_resolve",
    args: { p_key: "welcome", p_locale: "de-CH" },
  }]);
});
