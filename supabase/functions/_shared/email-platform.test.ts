import { unreadMessageEmail } from "./email-activity.ts";
import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  newEmailToken,
  subscriptionForm,
  tokenHash,
  validTopics,
} from "./email-subscription.ts";
import { parseCloudflareEmailEvent } from "./email-events.ts";
Deno.test("subscription tokens are random, hashed and purpose-specific forms do not mutate", async () => {
  const a = newEmailToken(), b = newEmailToken();
  assertEquals(a.length, 64);
  assertNotEquals(a, b);
  assertNotEquals(await tokenHash(a), a);
  assertEquals((await tokenHash(a)).length, 64);
  assertEquals(subscriptionForm("confirm", a)?.includes('method="post"'), true);
  assertEquals(
    subscriptionForm("unsubscribe", a)?.includes('method="post"'),
    true,
  );
  assertEquals(subscriptionForm("confirm", "<script>"), null);
  assertEquals(subscriptionForm("invalid", a), null);
});
Deno.test("topic preferences reject unknown or repeated topics", () => {
  assertEquals(validTopics(["newsletter", "events"]), true);
  assertEquals(validTopics([]), true);
  assertEquals(validTopics(["health"]), false);
  assertEquals(validTopics(["newsletter", "newsletter"]), false);
});
Deno.test("native Cloudflare events retain recipient, identity, event time and suppression semantics", () => {
  const event = {
    type: "cf.email.sending.message.bounced",
    source: { type: "email.sending" },
    payload: {
      eventId: "event-id",
      messageId: "message-id",
      recipient: "a@example.com",
      bounce: { type: "hard" },
    },
    metadata: { eventTimestamp: "2026-10-20T15:00:00Z" },
  };
  assertEquals(parseCloudflareEmailEvent(event), {
    p_event_id: "event-id",
    p_provider_id: "message-id",
    p_recipient: "a@example.com",
    p_type: "bounced",
    p_at: "2026-10-20T15:00:00Z",
    p_hard_bounce: true,
    p_suppression: false,
  });
  assertEquals(
    parseCloudflareEmailEvent({ ...event, type: "email.bounced" }),
    null,
  );
  assertEquals(
    parseCloudflareEmailEvent({
      ...event,
      metadata: { eventTimestamp: "invalid" },
    }),
    null,
  );
  assertEquals(
    parseCloudflareEmailEvent({
      ...event,
      type: "cf.email.sending.message.opened",
    }),
    null,
  );
});

Deno.test("message digests expose no sender identity, group names or private text", () => {
  const one = unreadMessageEmail(1);
  assertEquals(one.subject, "Unread message on Queer Guide");
  assertEquals(one.html.includes("https://queer.guide/hub/messages"), true);
  assertEquals(one.text.includes("settings?section=account"), true);
  assertEquals(
    unreadMessageEmail(4).subject,
    "4 unread messages on Queer Guide",
  );
});
