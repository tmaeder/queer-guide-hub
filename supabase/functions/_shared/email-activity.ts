/** Private activity stays in the authenticated app, never in an inbox preview. */
export function unreadMessageEmail(count: number) {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error("Invalid unread message count");
  }
  const heading = count === 1
    ? "You have an unread message"
    : `You have ${count} unread messages`;
  const inbox = "https://queer.guide/hub/messages";
  const preferences = "https://queer.guide/settings?section=account";
  return {
    subject: count === 1
      ? "Unread message on Queer Guide"
      : `${count} unread messages on Queer Guide`,
    html:
      `<h2>${heading}</h2><p>Open Queer Guide to read your messages.</p><p><a href="${inbox}">Open messages</a></p><p>You receive this because direct-message email digests are on. <a href="${preferences}">Change notification settings</a>.</p>`,
    text:
      `${heading}. Open ${inbox} to read your messages. Notification settings: ${preferences}`,
  };
}

export function groupMentionEmail() {
  const inbox = "https://queer.guide/hub/groups";
  const preferences = "https://queer.guide/settings?section=account";
  return {
    subject: "New group mention on Queer Guide",
    html:
      `<h2>You were mentioned in a group post</h2><p>Open Queer Guide to read it.</p><p><a href="${inbox}">Open your groups</a></p><p>You receive this because group mention emails are on. <a href="${preferences}">Change email settings</a>.</p>`,
    text:
      `You were mentioned in a group post. Open ${inbox} to read it. Email settings: ${preferences}`,
  };
}
