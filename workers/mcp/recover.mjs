import { mkdirSync, writeFileSync } from 'node:fs';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token)
  throw new Error(
    'Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN with Workers Scripts read permission.',
  );
const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/queer-guide-mcp`;
const destination = process.argv[2] ?? 'workers/mcp/.recovered';
mkdirSync(destination, { recursive: true });
const headers = { Authorization: `Bearer ${token}` };
const [source, settings] = await Promise.all([
  fetch(base, { headers }),
  fetch(base + '/settings', { headers }),
]);
if (!source.ok || !settings.ok)
  throw new Error(`Recovery failed: source ${source.status}, settings ${settings.status}`);
const modules = await source.formData();
const module = modules.get('index.js');
if (!module)
  throw new Error(
    'The deployed entrypoint changed; inspect the module inventory before proceeding.',
  );
writeFileSync(
  destination + '/index.js',
  typeof module === 'string' ? module : new Uint8Array(await module.arrayBuffer()),
);
writeFileSync(
  destination + '/settings.json',
  JSON.stringify(await settings.json(), null, 2) + '\n',
);
console.log(
  'Recovered deployed entrypoint and settings to ' +
    destination +
    '. Credentials were not written.',
);
