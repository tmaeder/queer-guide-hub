export interface DeliveryInput {
  id: string;
  category: 'transactional';
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}
export interface Receipt {
  status: 'accepted' | 'retry' | 'failed' | 'uncertain' | 'suppressed';
  id?: string;
  error?: string;
  retryAfterSeconds?: number;
}
const address = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export function validateDelivery(raw: unknown, domain: string): DeliveryInput | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(r.id) || r.category !== 'transactional')
    return null;
  if (typeof r.from !== 'string' || /[\r\n]/.test(r.from)) return null;
  const fromAddress = r.from.match(/<([^<>]+)>$/)?.[1] ?? r.from;
  if (
    !address.test(fromAddress) ||
    fromAddress.split('@')[1].toLowerCase() !== domain.toLowerCase()
  )
    return null;
  if (typeof r.to !== 'string' || !address.test(r.to) || r.to.length > 254) return null;
  if (
    typeof r.subject !== 'string' ||
    !r.subject.trim() ||
    r.subject.length > 998 ||
    /[\r\n]/.test(r.subject)
  )
    return null;
  if (typeof r.html !== 'string' || typeof r.text !== 'string' || (!r.html && !r.text)) return null;
  if (
    r.headers !== undefined &&
    (!r.headers || typeof r.headers !== 'object' || Array.isArray(r.headers))
  )
    return null;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(r.headers ?? {})) {
    if (
      !/^(?:X-[A-Za-z0-9-]+|In-Reply-To|References|List-Unsubscribe|List-Unsubscribe-Post)$/i.test(
        key,
      ) ||
      typeof value !== 'string' ||
      /[\r\n]/.test(value) ||
      value.length > 2048
    )
      return null;
    headers[key] = value;
  }
  return {
    id: r.id,
    category: 'transactional',
    from: r.from,
    to: r.to,
    subject: r.subject,
    html: r.html,
    text: r.text,
    headers,
  };
}
