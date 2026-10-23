import { EMAIL_TOPICS } from "./email-subscription.ts";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]!),
  );
export function managementForm(
  token: string,
  data: { status: string; topics: string[]; locale: string },
): string | null {
  if (
    !/^[a-f0-9]{64}$/.test(token) || !Array.isArray(data.topics) ||
    typeof data.locale !== "string"
  ) return null;
  const labels = {
    newsletter: "Newsletter",
    product_updates: "Product updates",
    events: "Event updates",
  };
  const subscribed = data.status === "subscribed";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences · Queer Guide</title><body><main><h1>Your email update preferences</h1><p>Newsletter delivery is unavailable. These choices apply to future updates; essential account messages and signed-in activity settings are separate.</p><p>${
    subscribed
      ? "Your subscription is confirmed."
      : "This mailbox is unsubscribed. A fresh confirmation is required to subscribe again."
  }</p><form method="post" action="?action=manage&amp;token=${token}"><fieldset ${
    subscribed ? "" : "disabled"
  }><legend>Choose updates</legend>${
    EMAIL_TOPICS.map((topic) =>
      `<p><label><input type="checkbox" name="topics" value="${topic}" ${
        data.topics.includes(topic) ? "checked" : ""
      }>${labels[topic]}</label></p>`
    ).join("")
  }</fieldset><p><label>Language code <input name="locale" required maxlength="16" pattern="[a-z]{2}(-[A-Za-z]{2,8})?" value="${
    escape(data.locale)
  }"></label></p>${
    subscribed
      ? '<button type="submit" name="decision" value="save">Save these preferences</button>'
      : ""
  }<button type="submit" name="decision" value="unsubscribe">Unsubscribe from all updates</button></form><p>This private link expires after one hour and works once. No changes happen until you submit a choice.</p></main></body></html>`;
}
export async function verifyEmailChallenge(
  token: unknown,
  action: "email-subscribe" | "email-manage",
): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret || typeof token !== "string" || !token || token.length > 2048) {
    return false;
  }
  const r = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ secret, response: token }),
    },
  );
  if (!r.ok) {
    await r.body?.cancel();
    return false;
  }
  const proof = await r.json();
  return proof.success === true &&
    ["queer.guide", "www.queer.guide"].includes(proof.hostname) &&
    proof.action === action;
}
