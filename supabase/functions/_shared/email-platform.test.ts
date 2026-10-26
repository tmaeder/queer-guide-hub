import { parseTripInvitationRequest } from "./email-trip-invitation.ts";
import { parseGroupMentionRequest } from "./email-group-mention.ts";
import {
  groupMentionEmail,
  tripInvitationEmail,
  unreadMessageEmail,
} from "./email-activity.ts";
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
  const htmlUrlMatch = one.html.match(/https:\/\/[^\s"'<>]+/);
  assertNotEquals(htmlUrlMatch, null);
  const htmlUrl = new URL(htmlUrlMatch![0]);
  assertEquals(htmlUrl.hostname, "queer.guide");
  assertEquals(htmlUrl.pathname, "/hub/messages");
  assertEquals(one.text.includes("settings?section=account"), true);
  assertEquals(
    unreadMessageEmail(4).subject,
    "4 unread messages on Queer Guide",
  );
});

Deno.test("group delivery rejects caller-selected recipients, content and arbitrary URLs", () => {
  assertEquals(parseGroupMentionRequest({ action: "tick" }), {
    action: "tick",
  });
  const request = {
    action: "tick",
    source_id: "a5555555-0000-4000-8000-000000000001",
  } as const;
  assertEquals(parseGroupMentionRequest(request), request);
  for (
    const value of [
      null,
      [],
      "tick",
      {},
      { ...request, source_id: "bad" },
      { ...request, user_email: "other@example.com" },
      { ...request, content: "private" },
      { ...request, post_url: "https://evil.invalid" },
      { ...request, notification_type: "new_post" },
    ]
  ) {
    assertEquals(parseGroupMentionRequest(value), null);
  }
});
Deno.test("group mentions keep names, private content and source identities out of the inbox", () => {
  const message = groupMentionEmail();
  assertEquals(message.subject, "New group mention on Queer Guide");
  const htmlUrlMatch = message.html.match(/https:\/\/[^\s"'<>]+/);
  assertNotEquals(htmlUrlMatch, null);
  const htmlUrl = new URL(htmlUrlMatch![0]);
  assertEquals(htmlUrl.hostname, "queer.guide");
  assertEquals(htmlUrl.pathname, "/hub/groups");
  assertEquals(message.html.includes("post_id"), false);
  assertEquals(message.text.includes("settings?section=account"), true);
});

Deno.test("trip invitation requests never accept an actor, recipient address or caller-authored content", () => {
  const id = "a6666666-0000-4000-8000-000000000001";
  assertEquals(
    parseTripInvitationRequest({
      action: "create",
      trip_id: id,
      username: "member",
      role: "viewer",
    })?.action,
    "create",
  );
  assertEquals(
    parseTripInvitationRequest({
      action: "respond",
      invitation_id: id,
      decision: "accept",
    })?.action,
    "respond",
  );
  for (
    const body of [
      { action: "create", trip_id: id, username: "member", role: "owner" },
      {
        action: "create",
        trip_id: id,
        username: "member",
        role: "viewer",
        actor_id: id,
      },
      { action: "respond", invitation_id: id, decision: "accept", user_id: id },
      { action: "tick", recipient: "other@example.com" },
      { action: "tick", html: "<p>private</p>" },
      { action: "respond", invitation_id: "bad", decision: "accept" },
    ]
  ) assertEquals(parseTripInvitationRequest(body), null);
  const email = tripInvitationEmail();
  assertEquals(email.subject, "New trip invitation on Queer Guide");
  const invitationUrlMatch = email.html.match(/https?:\/\/[^\s"'<>]+/);
  assertNotEquals(invitationUrlMatch, null);
  const invitationUrl = new URL(invitationUrlMatch![0]);
  assertEquals(invitationUrl.protocol, "https:");
  assertEquals(invitationUrl.hostname, "queer.guide");
  assertEquals(invitationUrl.pathname, "/trips/invitations");
  assertEquals(email.text.includes(id), false);
});

Deno.test("operational notice purposes use fixed app links without private details or caller URLs", async () => {
  const { operationalEmail } = await import("./email-operational.ts");
  for (
    const kind of [
      "event_change",
      "event_reminder",
      "trip_change",
      "trip_reminder",
      "group_request",
      "group_invitation",
      "group_comment",
      "community_comment",
      "business_claim",
      "business_status",
      "contribution",
      "payment",
    ]
  ) {
    const email = operationalEmail(kind);
    assertEquals(email.html.includes("Change email settings"), true);
    const links = Array.from(
      email.html.matchAll(/href="([^"]+)"/g),
      (match) => new URL(match[1]),
    );
    assertEquals(links.length, 2);
    for (const link of links) {
      assertEquals(link.protocol, "https:");
      assertEquals(link.hostname, "queer.guide");
    }
    assertEquals(email.html.includes("{{"), false);
  }
  let rejected = false;
  try {
    operationalEmail("newsletter");
  } catch {
    rejected = true;
  }
  assertEquals(rejected, true);
  assertEquals(
    operationalEmail("payment").text.includes("not a tax receipt"),
    true,
  );
});
