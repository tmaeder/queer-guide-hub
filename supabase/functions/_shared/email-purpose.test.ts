import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sendEmail } from "./email.ts";
Deno.test("Cloudflare rejects recurring digests and marketing before database or network access", async () => {
  const names = [
    "EMAIL_GATEWAY_URL",
    "EMAIL_GATEWAY_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const prior = names.map((n) => Deno.env.get(n));
  const originalFetch = globalThis.fetch;
  let requests = 0;
  try {
    Deno.env.set("EMAIL_GATEWAY_URL", "https://delivery.example.com");
    Deno.env.set("EMAIL_GATEWAY_SECRET", "fixture-only");
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    globalThis.fetch = () => {
      ++requests;
      throw new Error("Unexpected external request");
    };
    for (const category of ["newsletter", "marketing"] as const) {
      await assertRejects(
        () =>
          sendEmail({
            from: "fixture@example.com",
            to: ["recipient@example.com"],
            subject: "Digest fixture",
            html: "<p>Fixture</p>",
            category,
          }),
        Error,
        "cloudflare_transactional_only",
      );
    }
    assertEquals(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((n, i) =>
      prior[i] === undefined ? Deno.env.delete(n) : Deno.env.set(n, prior[i]!)
    );
  }
});
