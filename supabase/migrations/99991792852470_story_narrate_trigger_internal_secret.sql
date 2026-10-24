-- story-narrate now requires staff or X-Internal-Secret (it ran paid LLM calls
-- and could overwrite hand-edited story narratives for anyone holding the
-- public anon key). Its only server-side caller is this trigger, which sent
-- exactly that anon key. Same function, plus the internal secret from vault
-- (the pattern the crons use). Applies before functions deploy (db push runs
-- first), and the old code ignores the extra header.

create or replace function public.tg_auto_story_on_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_story_id uuid;
begin
  if new.content_type <> 'feedback' then return new; end if;
  v_story_id := public.auto_story_for_submission(new.id);
  if v_story_id is not null then
    perform net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/story-narrate',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
        'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')),
      body := jsonb_build_object('story_id', v_story_id));
  end if;
  return new;
end; $function$;

do $verify$
begin
  if not exists (select 1 from vault.secrets where name = 'internal_invoke_secret') then
    raise exception 'vault secret internal_invoke_secret missing';
  end if;
  if pg_get_functiondef('public.tg_auto_story_on_insert()'::regprocedure) !~* 'x-internal-secret' then
    raise exception 'tg_auto_story_on_insert does not send x-internal-secret';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auto_story_on_insert'
                 and tgrelid = 'public.community_submissions'::regclass and tgenabled <> 'D') then
    raise exception 'trg_auto_story_on_insert missing or disabled';
  end if;
end $verify$;
