-- Chat card message types: entity_share (live entity shared into a conversation)
-- and submission (in-chat submit flow result card).
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type = ANY (ARRAY[
    'text','image','file','system','gif','sticker','voice',
    'entity_share','submission'
  ]));
