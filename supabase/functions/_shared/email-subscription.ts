export const EMAIL_TOPICS = [
  "newsletter",
  "product_updates",
  "events",
] as const;
export function validTopics(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 3 &&
    new Set(value).size === value.length &&
    value.every((t) =>
      typeof t === "string" && (EMAIL_TOPICS as readonly string[]).includes(t)
    );
}
export async function tokenHash(token: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function newEmailToken(): string {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function subscriptionForm(action: string, token: string): string | null {
  if (
    !["confirm", "unsubscribe"].includes(action) ||
    !/^[a-f0-9]{64}$/.test(token)
  ) return null;
  const label = action === "confirm"
    ? "Confirm email subscription"
    : "Unsubscribe from email updates";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${label}</title><body><main><h1>${label}</h1><p>Confirm your choice for Queer Guide email updates.</p><form method="post" action="?action=${action}&amp;token=${token}"><button type="submit">${label}</button></form></main></body></html>`;
}
