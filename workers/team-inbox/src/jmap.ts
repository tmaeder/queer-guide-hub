/**
 * Minimal JMAP client (RFC 8620 / 8621) for importing a raw RFC-822 message
 * into a Stalwart mailbox over HTTPS.
 *
 * The worker reaches Stalwart through the existing Cloudflare Tunnel
 * (`mail.queer.guide → stalwart:8080`), so no mail port is ever exposed. Each
 * team mailbox is a separate Stalwart account; we authenticate AS the target
 * mailbox and import into its own INBOX (JMAP import lands in the authenticated
 * account). Credentials are per-mailbox worker secrets.
 */

interface JmapSession {
  apiUrl: string;
  uploadUrl: string;
  accountId: string;
}

function basicAuth(user: string, pass: string): string {
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

/** Fetch the JMAP session: API/upload endpoints + the primary mail account id. */
export async function getSession(baseUrl: string, user: string, pass: string): Promise<JmapSession> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/.well-known/jmap`, {
    headers: { Authorization: basicAuth(user, pass) },
  });
  if (!res.ok) throw new Error(`jmap session ${res.status}`);
  const body = (await res.json()) as {
    apiUrl: string;
    uploadUrl: string;
    primaryAccounts: Record<string, string>;
  };
  const accountId = body.primaryAccounts?.['urn:ietf:params:jmap:mail'];
  if (!accountId) throw new Error('jmap: no mail account');
  return { apiUrl: body.apiUrl, uploadUrl: body.uploadUrl, accountId };
}

/** Upload the raw message as a blob; returns its blobId. */
export async function uploadBlob(
  session: JmapSession,
  raw: Uint8Array,
  user: string,
  pass: string,
): Promise<string> {
  const url = session.uploadUrl.replace('{accountId}', encodeURIComponent(session.accountId));
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: basicAuth(user, pass), 'Content-Type': 'message/rfc822' },
    body: raw as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`jmap upload ${res.status}`);
  const body = (await res.json()) as { blobId: string };
  if (!body.blobId) throw new Error('jmap upload: no blobId');
  return body.blobId;
}

async function jmapCall(
  session: JmapSession,
  user: string,
  pass: string,
  methodCalls: unknown[],
): Promise<any> {
  const res = await fetch(session.apiUrl, {
    method: 'POST',
    headers: { Authorization: basicAuth(user, pass), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
      methodCalls,
    }),
  });
  if (!res.ok) throw new Error(`jmap api ${res.status}`);
  return res.json();
}

/** The INBOX mailbox id for the authenticated account. */
export async function getInboxId(session: JmapSession, user: string, pass: string): Promise<string> {
  const body = await jmapCall(session, user, pass, [
    ['Mailbox/query', { accountId: session.accountId, filter: { role: 'inbox' } }, '0'],
  ]);
  const id = body?.methodResponses?.[0]?.[1]?.ids?.[0];
  if (!id) throw new Error('jmap: no inbox');
  return id as string;
}

/**
 * Whether a message with this Message-ID header already exists in the account
 * (dedupes SMTP redeliveries). Best-effort — returns false on any error path.
 */
export async function messageExists(
  session: JmapSession,
  user: string,
  pass: string,
  messageId: string,
): Promise<boolean> {
  try {
    const body = await jmapCall(session, user, pass, [
      [
        'Email/query',
        { accountId: session.accountId, filter: { header: ['Message-Id', messageId] }, limit: 1 },
        '0',
      ],
    ]);
    return (body?.methodResponses?.[0]?.[1]?.ids?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Import an already-uploaded blob into the given mailbox. */
export async function importEmail(
  session: JmapSession,
  user: string,
  pass: string,
  blobId: string,
  mailboxId: string,
): Promise<void> {
  const body = await jmapCall(session, user, pass, [
    [
      'Email/import',
      {
        accountId: session.accountId,
        emails: {
          in: { blobId, mailboxIds: { [mailboxId]: true }, keywords: {} },
        },
      },
      '0',
    ],
  ]);
  const resp = body?.methodResponses?.[0];
  if (resp?.[0] === 'error') throw new Error(`jmap import error: ${JSON.stringify(resp[1])}`);
  const notCreated = resp?.[1]?.notCreated?.in;
  if (notCreated) throw new Error(`jmap import notCreated: ${JSON.stringify(notCreated)}`);
}
