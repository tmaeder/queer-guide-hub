import { describe, expect, it } from 'vitest';
import type { Email } from 'postal-mime';
import { buildMailboxRow, capText, makeSnippet, threadCandidateIds } from '../src/mailbox';

describe('capText / makeSnippet', () => {
  it('caps long text and passes short text through', () => {
    expect(capText('abcdef', 4)).toBe('abcd');
    expect(capText('abc', 4)).toBe('abc');
    expect(capText(null, 4)).toBeNull();
    expect(capText('', 4)).toBeNull();
  });

  it('collapses whitespace into a snippet with ellipsis', () => {
    expect(makeSnippet('  hello\n\n  world  ')).toBe('hello world');
    const long = 'x'.repeat(300);
    expect(makeSnippet(long)!.length).toBe(160);
    expect(makeSnippet(long)!.endsWith('…')).toBe(true);
    expect(makeSnippet('   ')).toBeNull();
    expect(makeSnippet(null)).toBeNull();
  });
});

describe('threadCandidateIds', () => {
  it('prefers In-Reply-To, then References, deduped', () => {
    expect(threadCandidateIds('<direct@x>', '<root@x> <mid@x> <direct@x>')).toEqual([
      '<direct@x>',
      '<root@x>',
      '<mid@x>',
    ]);
  });

  it('handles missing or malformed headers', () => {
    expect(threadCandidateIds(null, undefined)).toEqual([]);
    expect(threadCandidateIds('not-bracketed', null)).toEqual([]);
  });
});

function mime(over: Partial<Email>): Email {
  return {
    headers: [],
    attachments: [],
    ...over,
  } as Email;
}

describe('buildMailboxRow', () => {
  const opts = {
    ownerId: 'user-1',
    toAddress: 'tobias@queer.guide',
    envelopeFrom: 'envelope@example.com',
    maxBodyChars: 100,
    nowIso: '2026-07-11T00:00:00.000Z',
  };

  it('builds a full inbound row from a parsed message', () => {
    const row = buildMailboxRow(
      mime({
        subject: ' Your booking ',
        text: 'Confirmed: hotel',
        html: '<p>Confirmed: hotel</p>',
        from: { name: 'Booking.com', address: 'noreply@booking.com' },
        messageId: '<abc@booking.com>',
        date: '2026-07-10T10:00:00.000Z',
      }),
      opts,
    );
    expect(row).toMatchObject({
      owner_id: 'user-1',
      direction: 'inbound',
      folder: 'inbox',
      status: 'delivered',
      from_address: 'noreply@booking.com',
      from_name: 'Booking.com',
      to_address: 'tobias@queer.guide',
      subject: 'Your booking',
      body_text: 'Confirmed: hotel',
      snippet: 'Confirmed: hotel',
      message_id_header: '<abc@booking.com>',
      email_date: '2026-07-10T10:00:00.000Z',
    });
  });

  it('falls back to envelope from, default subject, and now-date', () => {
    const row = buildMailboxRow(mime({}), opts);
    expect(row.from_address).toBe('envelope@example.com');
    expect(row.subject).toBe('(no subject)');
    expect(row.email_date).toBe(opts.nowIso);
    expect(row.body_text).toBeNull();
    expect(row.snippet).toBeNull();
  });

  it('caps bodies and stores attachment metadata only', () => {
    const row = buildMailboxRow(
      mime({
        text: 'y'.repeat(500),
        attachments: [
          {
            filename: 'ticket.pdf',
            mimeType: 'application/pdf',
            content: new ArrayBuffer(2048),
            disposition: 'attachment',
          } as Email['attachments'][number],
        ],
      }),
      opts,
    );
    expect(row.body_text!.length).toBe(100);
    expect(row.attachments).toEqual([
      { filename: 'ticket.pdf', mimeType: 'application/pdf', size: 2048 },
    ]);
  });

  it('derives snippet from html when there is no text part', () => {
    const row = buildMailboxRow(mime({ html: '<div>Hello&nbsp;<b>world</b></div>' }), opts);
    expect(row.snippet).toBe('Hello world');
  });

  it('extracts threading candidates from headers', () => {
    const row = buildMailboxRow(
      mime({ inReplyTo: '<parent@x>', references: '<root@x> <parent@x>' }),
      opts,
    );
    expect(row.in_reply_to_header).toBe('<parent@x>');
    expect(row.references_header).toEqual(['<parent@x>', '<root@x>']);
  });
});

describe('isBookingParse', () => {
  it('accepts booking types at plausible confidence, rejects the rest', async () => {
    const { isBookingParse } = await import('../src/index');
    expect(isBookingParse({ type: 'lodging', confidence: 0.9 })).toBe(true);
    expect(isBookingParse({ type: 'flight', confidence: 0.5 })).toBe(true);
    expect(isBookingParse({ type: 'lodging', confidence: 0.4 })).toBe(false);
    expect(isBookingParse({ type: 'unknown', confidence: 0.9 })).toBe(false);
    expect(isBookingParse({ type: 'event', confidence: 0.9 })).toBe(false);
    expect(isBookingParse({ type: 'venue', confidence: 0.9 })).toBe(false);
    expect(isBookingParse(undefined)).toBe(false);
  });
});
