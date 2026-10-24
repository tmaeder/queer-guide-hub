-- Support owner-scoped received/Sent keyset reads and owner FK/erasure lookups.
-- This adds no access policy or mailbox content fields.
begin;
create index if not exists idx_mailbox_owner_email_date_id
 on public.mailbox_emails(owner_id,email_date desc,id desc);
notify pgrst,'reload schema';
commit;
