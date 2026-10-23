import { handleMailboxSend } from "./handler.ts";
Deno.serve((req: Request) => handleMailboxSend(req));
