import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { requireInternalOrAdmin } from '../_shared/supabase-client.ts';
import {
  domainInstructionMailConfig,
  dispatchDomainInstructionMail,
} from '../_shared/redirect-domain-mail.ts';
Deno.serve(async (req: Request) => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  if (req.method !== 'POST') return json({ error: 'Method not supported' }, 405);
  if (new URL(req.url).search) return json({ error: 'Unexpected mail delivery parameters' }, 400);
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const auth = await requireInternalOrAdmin(req, db);
  if (auth instanceof Response) return auth;
  try {
    const config = await domainInstructionMailConfig(
      Deno.env.get('RESEND_API_KEY') ?? '',
      Deno.env.get('REDIRECT_DOMAIN_EMAIL_FROM') ?? '',
      Deno.env.get('REDIRECT_CNAME_TARGET') ?? '',
    );
    return json(await dispatchDomainInstructionMail(db, config));
  } catch {
    return json({ error: 'Instruction email delivery unavailable' }, 503);
  }
});
