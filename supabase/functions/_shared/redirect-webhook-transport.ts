/* eslint no-control-regex: "off" -- Rejecting ASCII control characters is intentional input/header validation. */
/** DNS-pinned HTTPS delivery. No unpinned fetch fallback or caller-provided TLS policy. */
export type WebhookErrorCode =
  | 'dns_blocked'
  | 'dns_unavailable'
  | 'tls_error'
  | 'network_error'
  | 'timeout'
  | 'invalid_response'
  | 'http_error'
  | 'scope_changed';
export class WebhookTransportError extends Error {
  constructor(public readonly code: WebhookErrorCode) {
    super(code);
  }
}
export interface WebhookSocket {
  remoteAddr: { hostname: string };
  read(buffer: Uint8Array): Promise<number | null>;
  write(buffer: Uint8Array): Promise<number>;
  close(): void;
}
export interface WebhookTlsSocket extends WebhookSocket {
  handshake(): Promise<{ alpnProtocol?: string | null }>;
}
export interface WebhookNetwork {
  connect(options: { hostname: string; port: number }): Promise<WebhookSocket>;
  startTls(
    socket: WebhookSocket,
    options: { hostname: string; alpnProtocols: string[] },
  ): Promise<WebhookTlsSocket>;
}
function ipv6Parts(address: string): number[] | null {
  let text = address.toLowerCase();
  if (text.includes('.')) {
    const last = text.lastIndexOf(':');
    const octets = text.slice(last + 1).split('.');
    if (
      octets.length !== 4 ||
      octets.some((value) => !/^\d{1,3}$/.test(value) || Number(value) > 255)
    )
      return null;
    text =
      text.slice(0, last + 1) +
      ((Number(octets[0]) << 8) | Number(octets[1])).toString(16) +
      ':' +
      ((Number(octets[2]) << 8) | Number(octets[3])).toString(16);
  }
  if (!/^[0-9a-f:]+$/.test(text) || text.length > 39) return null;
  const pieces = text.split('::');
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(':') : [],
    right = pieces[1] ? pieces[1].split(':') : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if ((pieces.length === 1 && missing !== 0) || (pieces.length === 2 && missing < 1)) return null;
  return [
    ...left.map((part) => parseInt(part, 16)),
    ...Array(missing).fill(0),
    ...right.map((part) => parseInt(part, 16)),
  ];
}
export function publicWebhookIp(address: string) {
  if (address.includes(':')) {
    const parts = ipv6Parts(address);
    return (
      !!parts &&
      (parts[0] & 0xe000) === 0x2000 &&
      parts[0] !== 0x2002 &&
      !(parts[0] === 0x2001 && (parts[1] < 0x0200 || parts[1] === 0x0db8)) &&
      !(parts[0] === 0x3fff && parts[1] < 0x1000)
    );
  }
  const parts = address.split('.');
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(?:0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
  )
    return false;
  const [a, b, c] = parts.map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
function sameIp(left: string, right: string) {
  if (!publicWebhookIp(left) || !publicWebhookIp(right)) return false;
  if (!left.includes(':') && !right.includes(':')) return left === right;
  return JSON.stringify(ipv6Parts(left)) === JSON.stringify(ipv6Parts(right));
}
export function webhookUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Provide a public HTTPS webhook URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.href.length > 2048 ||
    /[\x00-\x20\\]/.test(value)
  )
    throw new Error('Use public HTTPS without credentials, fragments or spaces');
  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  const literal = host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host);
  if (
    literal
      ? !publicWebhookIp(host)
      : !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
          host,
        ) ||
        host.length > 253 ||
        /(?:^|\.)(?:localhost|local|internal|home|lan|arpa|test|invalid|example|onion)$/.test(host)
  )
    throw new Error('Webhook host must be a public address');
  url.hostname = literal && host.includes(':') ? '[' + host + ']' : host;
  return url;
}
async function boundedDnsJson(response: Response) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new WebhookTransportError('dns_unavailable');
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 65536) throw new WebhookTransportError('dns_unavailable');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const data = new Uint8Array(bytes);
  let at = 0;
  for (const chunk of chunks) {
    data.set(chunk, at);
    at += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new WebhookTransportError('dns_unavailable');
  }
}
export async function resolveWebhookAddress(
  url: URL,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)) {
    if (!publicWebhookIp(host)) throw new WebhookTransportError('dns_blocked');
    return host;
  }
  let records: { name: string; type: number; data: string }[];
  try {
    const results = await Promise.all(
      ['A', 'AAAA'].map(async (type) => {
        const query = new URL('https://cloudflare-dns.com/dns-query');
        query.searchParams.set('name', host);
        query.searchParams.set('type', type);
        const body = await boundedDnsJson(
          await fetcher(query, {
            headers: { Accept: 'application/dns-json' },
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
            signal,
          }),
        );
        if (
          !body ||
          typeof body !== 'object' ||
          ![0, 3].includes(body.Status) ||
          !Array.isArray(body.Question) ||
          body.Question.length !== 1 ||
          typeof body.Question[0].name !== 'string' ||
          body.Question[0].name.toLowerCase().replace(/\.$/, '') !== host ||
          !Array.isArray(body.Answer ?? []) ||
          (body.Answer ?? []).length > 32
        )
          throw new WebhookTransportError('dns_unavailable');
        return body.Answer ?? [];
      }),
    );
    records = results.flat();
  } catch (error) {
    if (signal.aborted) throw new WebhookTransportError('timeout');
    throw error instanceof WebhookTransportError
      ? error
      : new WebhookTransportError('dns_unavailable');
  }
  if (
    records.some(
      (row) =>
        !row ||
        typeof row !== 'object' ||
        !Number.isInteger(row.type) ||
        typeof row.name !== 'string' ||
        row.name.length > 254 ||
        typeof row.data !== 'string' ||
        row.data.length > 1024,
    )
  )
    throw new WebhookTransportError('dns_unavailable');
  const names = new Set([host]);
  for (let pass = 0; pass < 8; pass++)
    for (const row of records) {
      if (
        row.type === 5 &&
        typeof row.name === 'string' &&
        names.has(row.name.toLowerCase().replace(/\.$/, '')) &&
        typeof row.data === 'string'
      )
        names.add(row.data.toLowerCase().replace(/\.$/, ''));
    }
  const addresses = records
    .filter(
      (row) =>
        (row.type === 1 || row.type === 28) &&
        typeof row.name === 'string' &&
        names.has(row.name.toLowerCase().replace(/\.$/, '')),
    )
    .map((row) => row.data);
  if (!addresses.length) throw new WebhookTransportError('dns_unavailable');
  if (addresses.some((address) => typeof address !== 'string' || !publicWebhookIp(address)))
    throw new WebhookTransportError('dns_blocked');
  signal.throwIfAborted();
  return addresses.find((address) => !address.includes(':')) ?? addresses[0];
}
export function webhookSecretBytes(secret: string) {
  if (!/^whsec_[A-Za-z0-9+/]{43}=$/.test(secret)) throw new Error('Invalid webhook signing secret');
  const encoded = secret.slice(6),
    decoded = atob(encoded);
  if (decoded.length !== 32 || btoa(decoded) !== encoded)
    throw new Error('Invalid webhook signing secret');
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
export async function webhookSignatures(
  secrets: string[],
  id: string,
  timestamp: number,
  body: string,
) {
  if (
    !/^[a-f0-9-]{36}$/i.test(id) ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    new TextEncoder().encode(body).length > 32768 ||
    secrets.length < 1 ||
    secrets.length > 2
  )
    throw new Error('Invalid webhook signing input');
  return (
    await Promise.all(
      secrets.map(async (secret) => {
        const key = await crypto.subtle.importKey(
          'raw',
          webhookSecretBytes(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        );
        const signature = new Uint8Array(
          await crypto.subtle.sign(
            'HMAC',
            key,
            new TextEncoder().encode(id + '.' + timestamp + '.' + body),
          ),
        );
        return 'v1,' + btoa(String.fromCharCode(...signature));
      }),
    )
  ).join(' ');
}
export interface WebhookHttpReceipt {
  status: number;
  excerpt: string;
  retryAfter: number | null;
}
const closeSocket = (socket: WebhookSocket | null) => {
  try {
    socket?.close();
  } catch {
    /* Already closed. */
  }
};
/** Resolve separately, recheck the lease, then pass only the pinned IP to this sender. */
export async function sendPinnedWebhook(
  url: URL,
  address: string,
  body: string,
  headers: Record<string, string>,
  network: WebhookNetwork,
  parentSignal: AbortSignal,
): Promise<WebhookHttpReceipt> {
  if (!publicWebhookIp(address)) throw new WebhookTransportError('dns_blocked');
  const canonical = webhookUrl(url.href),
    host = canonical.hostname.replace(/^\[|\]$/g, ''),
    signal = AbortSignal.any([parentSignal, AbortSignal.timeout(12000)]);
  if (
    Object.keys(headers).some(
      (key) =>
        ![
          'webhook-id',
          'webhook-timestamp',
          'webhook-signature',
          'webhook-delivery-id',
          'webhook-key-version',
        ].includes(key),
    ) ||
    Object.values(headers).some((value) => value.length > 512 || /[\x00-\x1f\x7f]/.test(value))
  )
    throw new WebhookTransportError('invalid_response');
  const bytes = new TextEncoder().encode(body);
  if (bytes.length > 32768) throw new WebhookTransportError('invalid_response');
  let socket: WebhookSocket | null = null,
    phase: 'connect' | 'tls' | 'http' = 'connect';
  const abort = () => closeSocket(socket);
  signal.addEventListener('abort', abort, { once: true });
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(new WebhookTransportError('timeout')), {
      once: true,
    });
    if (signal.aborted) reject(new WebhookTransportError('timeout'));
  });
  const receive = async (buffer: Uint8Array) => {
    signal.throwIfAborted();
    return Promise.race([socket!.read(buffer), aborted]);
  };
  try {
    const pending = network.connect({ hostname: address, port: Number(canonical.port || 443) });
    void pending.then(
      (value) => {
        if (signal.aborted) closeSocket(value);
      },
      () => {},
    );
    socket = await Promise.race([pending, aborted]);
    if (!sameIp(socket.remoteAddr.hostname, address))
      throw new WebhookTransportError('network_error');
    signal.throwIfAborted();
    phase = 'tls';
    const upgrading = network.startTls(socket, { hostname: host, alpnProtocols: ['http/1.1'] });
    void upgrading.then(
      (value) => {
        if (signal.aborted) closeSocket(value);
      },
      () => {},
    );
    const tls = await Promise.race([upgrading, aborted]);
    socket = tls;
    const handshake = await Promise.race([tls.handshake(), aborted]);
    if (handshake.alpnProtocol && handshake.alpnProtocol !== 'http/1.1')
      throw new WebhookTransportError('tls_error');
    signal.throwIfAborted();
    phase = 'http';
    const lines = [
      'POST ' + canonical.pathname + canonical.search + ' HTTP/1.1',
      'Host: ' + canonical.host,
      'Content-Type: application/json',
      'Content-Length: ' + bytes.length,
      'Connection: close',
      'User-Agent: QueerGuide-Webhooks/1',
      ...Object.entries(headers).map(([name, value]) => name + ': ' + value),
      '',
      '',
    ];
    for (const chunk of [new TextEncoder().encode(lines.join('\r\n')), bytes]) {
      let offset = 0;
      while (offset < chunk.length) {
        signal.throwIfAborted();
        const written = await Promise.race([socket.write(chunk.subarray(offset)), aborted]);
        if (!Number.isInteger(written) || written < 1 || written > chunk.length - offset)
          throw new WebhookTransportError('network_error');
        offset += written;
      }
    }
    let buffer = new Uint8Array(0),
      headerText = '',
      bodyStart = new Uint8Array(0),
      informational = 0,
      status = 0;
    const textDecoder = new TextDecoder('utf-8', { fatal: true });
    for (;;) {
      let boundary = -1;
      for (let i = 0; i + 3 < buffer.length; i++)
        if (
          buffer[i] === 13 &&
          buffer[i + 1] === 10 &&
          buffer[i + 2] === 13 &&
          buffer[i + 3] === 10
        ) {
          boundary = i;
          break;
        }
      if (boundary < 0) {
        if (buffer.length > 16384) throw new WebhookTransportError('invalid_response');
        const part = new Uint8Array(4096),
          length = await receive(part);
        if (length === null || length === 0) throw new WebhookTransportError('invalid_response');
        const merged = new Uint8Array(buffer.length + length);
        merged.set(buffer);
        merged.set(part.subarray(0, length), buffer.length);
        buffer = merged;
        continue;
      }
      if (boundary > 16384) throw new WebhookTransportError('invalid_response');
      headerText = textDecoder.decode(buffer.subarray(0, boundary));
      const match = headerText.split('\r\n')[0].match(/^HTTP\/1\.[01] ([1-5]\d{2})(?: [^\r\n]*)?$/);
      if (!match) throw new WebhookTransportError('invalid_response');
      status = Number(match[1]);
      bodyStart = buffer.slice(boundary + 4);
      if (status >= 100 && status < 200 && status !== 101) {
        if (++informational > 3) throw new WebhookTransportError('invalid_response');
        buffer = bodyStart;
        continue;
      }
      if (status === 101) throw new WebhookTransportError('invalid_response');
      break;
    }
    const responseHeaders = new Map<string, string>();
    for (const line of headerText.split('\r\n').slice(1)) {
      const match = line.match(
        /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*([^\x00-\x08\x0a-\x1f\x7f]*)$/,
      );
      if (!match) throw new WebhookTransportError('invalid_response');
      const name = match[1].toLowerCase();
      if (responseHeaders.has(name) && ['content-length', 'transfer-encoding'].includes(name))
        throw new WebhookTransportError('invalid_response');
      responseHeaders.set(name, match[2].trim());
    }
    if (responseHeaders.has('content-length') && responseHeaders.has('transfer-encoding'))
      throw new WebhookTransportError('invalid_response');
    const retry = responseHeaders.get('retry-after');
    let retryAfter: number | null = null;
    if (retry) {
      const delay = /^\d+$/.test(retry)
        ? Number(retry)
        : Math.ceil((Date.parse(retry) - Date.now()) / 1000);
      if (Number.isFinite(delay) && delay > 0) retryAfter = Math.min(86400, Math.ceil(delay));
    }
    let excerpt = '';
    if (status !== 204 && status !== 304 && responseHeaders.get('content-length') !== '0') {
      const chunks: Uint8Array[] = [];
      let total = 0,
        pendingBody = bodyStart,
        ended = false;
      const bodyTimer = setTimeout(() => closeSocket(socket), 1500);
      const append = (data: Uint8Array) => {
        const piece = data.subarray(0, 4096 - total);
        chunks.push(piece);
        total += piece.length;
      };
      try {
        if (
          responseHeaders.get('content-encoding') &&
          responseHeaders.get('content-encoding') !== 'identity'
        )
          excerpt = '[Compressed response omitted]';
        else if (responseHeaders.get('transfer-encoding')?.toLowerCase() === 'chunked') {
          const need = async (minimum: number) => {
            while (pendingBody.length < minimum) {
              const more = new Uint8Array(4096),
                read = await receive(more);
              if (read === null || read === 0) {
                ended = true;
                break;
              }
              const combined = new Uint8Array(pendingBody.length + read);
              combined.set(pendingBody);
              combined.set(more.subarray(0, read), pendingBody.length);
              pendingBody = combined;
              if (pendingBody.length > 16384) throw new Error('Invalid chunk');
            }
          };
          while (total < 4096 && !ended) {
            let newline = -1;
            while (newline < 0) {
              for (let i = 0; i + 1 < pendingBody.length; i++)
                if (pendingBody[i] === 13 && pendingBody[i + 1] === 10) {
                  newline = i;
                  break;
                }
              if (newline >= 0) break;
              if (pendingBody.length > 256) throw new Error('Invalid chunk');
              await need(pendingBody.length + 1);
              if (ended) break;
            }
            if (ended) break;
            const line = new TextDecoder().decode(pendingBody.subarray(0, newline));
            if (!/^[a-fA-F0-9]{1,12}(?:;[^\r\n]*)?$/.test(line)) throw new Error('Invalid chunk');
            let count = parseInt(line.split(';')[0], 16);
            pendingBody = pendingBody.slice(newline + 2);
            if (!count) break;
            while (count > 0 && total < 4096) {
              await need(1);
              if (ended) break;
              const size = Math.min(count, pendingBody.length, 4096 - total);
              append(pendingBody.subarray(0, size));
              pendingBody = pendingBody.slice(size);
              count -= size;
            }
            if (total >= 4096 || ended) break;
            await need(2);
            if (pendingBody[0] !== 13 || pendingBody[1] !== 10) throw new Error('Invalid chunk');
            pendingBody = pendingBody.slice(2);
          }
        } else {
          const rawLength = responseHeaders.get('content-length');
          if (rawLength && !/^\d{1,12}$/.test(rawLength))
            throw new Error('Invalid response length');
          const expected = rawLength ? Math.min(4096, Number(rawLength)) : 4096;
          append(pendingBody.subarray(0, expected));
          while (total < expected) {
            const more = new Uint8Array(Math.min(4096 - total, expected - total)),
              read = await receive(more);
            if (read === null || read === 0) break;
            append(more.subarray(0, read));
          }
        }
        if (!excerpt) {
          const joined = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            joined.set(chunk, offset);
            offset += chunk.length;
          }
          excerpt = new TextDecoder('utf-8', { fatal: true }).decode(joined, { stream: true });
        }
      } catch {
        excerpt = excerpt || '[Response body unavailable]';
      } finally {
        clearTimeout(bodyTimer);
      }
    }
    return { status, excerpt, retryAfter };
  } catch (error) {
    if (error instanceof WebhookTransportError) throw error;
    if (signal.aborted) throw new WebhookTransportError('timeout');
    throw new WebhookTransportError(
      phase === 'tls' ? 'tls_error' : phase === 'connect' ? 'network_error' : 'invalid_response',
    );
  } finally {
    signal.removeEventListener('abort', abort);
    closeSocket(socket);
  }
}
