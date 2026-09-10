/**
 * smtp-relay — SMTP → Cloudflare Email Sending bridge.
 *
 * Cloudflare Email Sending has no SMTP endpoint (Workers binding or REST only),
 * but Twenty and Stalwart can only send over SMTP. This tiny internal-only SMTP
 * server accepts their outbound mail, parses it, and forwards each message to
 * the Cloudflare Email Sending REST API. Nothing here is exposed publicly — it
 * lives on the compose network and listens on 2525.
 *
 * Env:
 *   CF_ACCOUNT_ID        Cloudflare account id
 *   CF_EMAIL_TOKEN       API token with Email Sending → Send permission
 *   ALLOWED_FROM_DOMAIN  only relay mail From this domain (default queer.guide)
 *   RELAY_SMTP_USER/PASS optional shared credential the senders must present
 *   RELAY_PORT           listen port (default 2525)
 */

import { SMTPServer } from 'smtp-server';
import PostalMime from 'postal-mime';

const {
  CF_ACCOUNT_ID,
  CF_EMAIL_TOKEN,
  ALLOWED_FROM_DOMAIN = 'queer.guide',
  RELAY_SMTP_USER,
  RELAY_SMTP_PASS,
  RELAY_PORT = '2525',
} = process.env;

if (!CF_ACCOUNT_ID || !CF_EMAIL_TOKEN) {
  console.error('smtp-relay: CF_ACCOUNT_ID and CF_EMAIL_TOKEN are required');
  process.exit(1);
}

const CF_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/email/sending/send`;

const toBase64 = (content) => {
  if (typeof content === 'string') return Buffer.from(content).toString('base64');
  return Buffer.from(content).toString('base64');
};

const addrs = (list) => (list ?? []).map((a) => a.address).filter(Boolean);

async function relayToCloudflare(parsed, envelope) {
  const from = parsed.from?.address || envelope.mailFrom?.address;
  if (!from || !from.toLowerCase().endsWith(`@${ALLOWED_FROM_DOMAIN.toLowerCase()}`)) {
    throw new Error(`refusing to relay From ${from} (not @${ALLOWED_FROM_DOMAIN})`);
  }

  const envelopeRcpts = (envelope.rcptTo ?? []).map((r) => r.address.toLowerCase());
  const headerTo = addrs(parsed.to);
  const headerCc = addrs(parsed.cc);
  const known = new Set([...headerTo, ...headerCc].map((a) => a.toLowerCase()));
  const bcc = envelopeRcpts.filter((a) => !known.has(a));
  const to = headerTo.length ? headerTo : envelopeRcpts;

  const payload = {
    from: parsed.from?.name ? { address: from, name: parsed.from.name } : from,
    to,
    subject: parsed.subject || '(no subject)',
  };
  if (headerCc.length) payload.cc = headerCc;
  if (bcc.length) payload.bcc = bcc;
  if (parsed.html) payload.html = parsed.html;
  if (parsed.text) payload.text = parsed.text;
  if (!payload.html && !payload.text) payload.text = '';
  if (parsed.replyTo?.[0]?.address) payload.reply_to = parsed.replyTo[0].address;

  const headers = {};
  if (parsed.inReplyTo) headers['In-Reply-To'] = parsed.inReplyTo;
  if (parsed.references) headers['References'] = parsed.references;
  if (Object.keys(headers).length) payload.headers = headers;

  const attachments = (parsed.attachments ?? []).map((a) => {
    const cid = a.contentId?.replace(/^<|>$/g, '');
    return {
      content: toBase64(a.content),
      filename: a.filename || 'attachment',
      type: a.mimeType || 'application/octet-stream',
      disposition: a.disposition === 'inline' ? 'inline' : 'attachment',
      ...(cid ? { content_id: cid } : {}),
    };
  });
  if (attachments.length) payload.attachments = attachments;

  const res = await fetch(CF_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_EMAIL_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`cloudflare send ${res.status}: ${body}`);
  console.log(`relayed ${from} → ${to.join(',')} (${res.status})`);
}

const server = new SMTPServer({
  disabledCommands: ['STARTTLS'], // internal network only; TLS terminates upstream
  authOptional: !RELAY_SMTP_USER,
  onAuth(auth, _session, callback) {
    if (!RELAY_SMTP_USER) return callback(null, { user: 'anonymous' });
    if (auth.username === RELAY_SMTP_USER && auth.password === RELAY_SMTP_PASS) {
      return callback(null, { user: auth.username });
    }
    return callback(new Error('invalid credentials'));
  },
  async onData(stream, session, callback) {
    try {
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      const parsed = await PostalMime.parse(raw);
      await relayToCloudflare(parsed, session.envelope);
      callback();
    } catch (err) {
      console.error('relay failed:', err.message);
      callback(new Error('451 relay to Cloudflare failed'));
    }
  },
});

server.on('error', (err) => console.error('smtp-relay error:', err.message));
server.listen(Number(RELAY_PORT), '0.0.0.0', () => {
  console.log(`smtp-relay listening on ${RELAY_PORT} → Cloudflare Email Sending`);
});
