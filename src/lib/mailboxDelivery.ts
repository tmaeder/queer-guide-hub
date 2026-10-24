export const mailboxDeliveryStates = [
  'queued',
  'processing',
  'accepted',
  'deferred',
  'uncertain',
  'delivered',
  'failed',
  'bounced',
  'suppressed',
  'complained',
] as const;
export type MailboxDeliveryStatus = (typeof mailboxDeliveryStates)[number];
export function isMailboxDeliveryStatus(value: unknown): value is MailboxDeliveryStatus {
  return typeof value === 'string' && mailboxDeliveryStates.some((state) => state === value);
}
export function isMailboxDeliveryPending(status: MailboxDeliveryStatus | null | undefined) {
  return (
    status !== null &&
    status !== undefined &&
    ['queued', 'processing', 'accepted', 'deferred', 'uncertain'].includes(status)
  );
}
