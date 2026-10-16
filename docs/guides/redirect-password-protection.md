# Protected redirect links

Passwords are salted PBKDF2-SHA256 hashes. The resolver loads protection on each
request before disclosing or recording a destination. Never distribute passwords
in query strings; the POST form is the preferred entry path. Successful password
POSTs return HTTP 303, including links configured with 307/308, so browsers fetch
the destination without forwarding the password form body. Native JSON transport
reports the same effective 303 in its payload; see
[the native protocol](redirect-native-resolution.md).

## Attempt limits

A private PostgreSQL reservation runs before password verification. Each link
allows 10 checks per client address hash in a rolling-start 15-minute window,
with a shared ceiling of 1,000 checks per link/window. Accepted passwords also
consume a check. Subsequent attempts return HTTP 429, a destination-free page and
Retry-After seconds (1–900). Opening the empty GET form and HEAD requests do not
consume an attempt. HEAD always challenges protected links without verifying a
password. Database outages fail closed with 503.

Counters saturate rather than grow indefinitely. Each reservation lazily deletes
up to 100 buckets older than a day, skipping locked rows; this is bounded cleanup,
not a guaranteed wall-clock deletion schedule. Link deletion cascades its buckets.
No raw client addresses or passwords are stored in the limiter. Anonymous and
ordinary authenticated clients cannot read or mutate counters or call the RPC.

## Branded route deployment

Configure the same strong random REDIRECT_RELAY_SECRET (at least 32 characters)
as a Cloudflare Pages secret and Supabase Edge Function secret. Do not put it in
VITE variables or client code. The proxy signs its CDN visitor IP, slug and
current timestamp with HMAC-SHA256. The resolver accepts matching proofs within
120 seconds and otherwise falls back to its own CDN address. It never uses an
arbitrary X-Forwarded-For header for throttling or analytics IP hashing.

Without matching secrets, clients behind the Pages relay may share one bucket
and be throttled together. A changed address can start a new client bucket;
the shared link ceiling remains. This is application protection, not a substitute
for infrastructure traffic controls under a distributed attack.

Apply the redirect_password_throttle migration before deploying the new resolver.
Set REDIRECT_IP_HASH_SALT to a stable private secret as well. Changing that salt
starts new client buckets and changes analytics address hashes. Do not expose
service-role keys to the browser. Native branded password logos remain pending.

## Verification status

Local source tests cover signatures, altered/expired proofs, real resolver
challenge behavior and branded 429 forwarding. Isolated PostgreSQL tests execute
the limiter migration and verify counters, role restrictions and reset/cleanup.
Production secrets, migration and browser delivery have not yet been verified.
