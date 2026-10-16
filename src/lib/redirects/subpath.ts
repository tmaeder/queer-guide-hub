import { redirectHostname } from '../../../supabase/functions/_shared/redirect-domains';
import { validPublicTarget } from '../../../supabase/functions/_shared/link-policy';

export type SubpathPlatform = 'cloudflare' | 'nextjs' | 'vercel' | 'netlify';
export interface SubpathSetup {
  platform: SubpathPlatform;
  website: string;
  prefix: string;
  hostname: string;
  filename: string;
  instructions: string;
  configuration: string;
  entryExample: string;
  targetExample: string;
}

export function subpathSettings(website: string, path: string, hostname: string) {
  if (website !== website.trim() || /[\s\\]/.test(website))
    throw new Error('Enter a public HTTPS website origin, such as https://example.com.');
  const authority = website.match(/^https:\/\/([^/?#]+)\/?$/i)?.[1];
  if (!authority || /[:@%]/.test(authority))
    throw new Error(
      'Use a public HTTPS origin without credentials, port, path, query or fragment.',
    );
  let site: URL;
  try {
    site = new URL(website);
  } catch {
    throw new Error('Enter a public HTTPS website origin.');
  }
  if (
    site.protocol !== 'https:' ||
    site.port ||
    site.username ||
    site.password ||
    site.pathname !== '/' ||
    site.search ||
    site.hash ||
    !validPublicTarget(site.href) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]\.?$/.test(
      site.hostname,
    ) ||
    site.hostname.length > 253 ||
    /(?:^|\.)onion\.?$/.test(site.hostname) ||
    /^\d+(?:\.\d+){3}$/.test(site.hostname)
  )
    throw new Error('Use a public HTTPS origin without a port, path, query or fragment.');
  const target = redirectHostname(hostname);
  if (site.hostname.replace(/\.$/, '') === target)
    throw new Error('The website and short-link hostname must be different.');
  if (
    path.length > 120 ||
    !/^\/[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_-]*)*$/.test(path) ||
    /^\/(?:api|admin|auth|login|signup|share|\.well-known)(?:\/|$)/i.test(path)
  )
    throw new Error(
      'Choose a non-root path such as /r, using letters, numbers, hyphens or underscores. Avoid website account/API paths.',
    );
  site.hostname = site.hostname.replace(/\.$/, '');
  return { website: site.origin, prefix: path, hostname: target };
}

/** Standalone module: copied verbatim into the existing website's Cloudflare Worker route. */
export function subpathWorker(settings: ReturnType<typeof subpathSettings>) {
  const { website, prefix, hostname } = subpathSettings(
    settings.website,
    settings.prefix,
    settings.hostname,
  );
  return `const website = ${JSON.stringify(website)};
const prefix = ${JSON.stringify(prefix)};
const targetOrigin = ${JSON.stringify('https://' + hostname)};
export default {
  /** @param {Request} request */
  async fetch(request) {
    const source = new URL(request.url);
    if (source.origin !== website) return new Response(null, { status: 404 });
    if (source.pathname !== prefix && !source.pathname.startsWith(prefix + '/')) {
      return fetch(request);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
    }
    const target = new URL(targetOrigin);
    target.pathname = source.pathname.slice(prefix.length) || '/';
    target.search = source.search;
    return new Response(null, { status: 307, headers: {
      Location: target.href,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    } });
  }
};
`;
}

export function subpathSetup(
  website: string,
  prefix: string,
  hostname: string,
  platform: SubpathPlatform,
): SubpathSetup {
  const settings = subpathSettings(website, prefix, hostname);
  const destination = 'https://' + settings.hostname;
  const rule = {
    source: settings.prefix + '/:path*',
    destination: destination + '/:path*',
    permanent: false,
  };
  let filename: string, instructions: string, configuration: string;
  switch (platform) {
    case 'cloudflare':
      filename = 'worker.js';
      instructions = `Add this module to a Worker Route on the existing website: ${settings.website}${settings.prefix}*. Other paths pass through to the website origin. Use a Route, rather than replacing the website with a Worker Custom Domain. Disable request URL logging on this adapter.`;
      configuration = subpathWorker(settings);
      break;
    case 'nextjs':
      filename = 'next.config.mjs';
      instructions =
        'Merge this rule into redirects() in the existing Next.js configuration, before broader matches. It uses a temporary redirect and passes the query through. Test browser navigation to the full entry URL after deployment.';
      configuration = `export default {\n  async redirects() {\n    return ${JSON.stringify(
        [{ ...rule, basePath: false, locale: false }],
        null,
        2,
      )
        .split('\n')
        .join('\n    ')};\n  }\n};\n`;
      break;
    case 'vercel':
      filename = 'vercel.json';
      instructions =
        'Merge these temporary redirect rules into the existing Vercel configuration before broader matches. Query parameters pass through. Keep the rest of the website configuration.';
      configuration = JSON.stringify({ redirects: [rule] }, null, 2) + '\n';
      break;
    case 'netlify':
      filename = '_redirects';
      instructions =
        'Add these temporary302 rules before broader matches in the existing _redirects file. Netlify passes query parameters through. The ! explicitly gives this chosen path priority over existing files; confirm it does not replace a website page you need.';
      configuration = `${settings.prefix} ${destination}/ 302!\n${settings.prefix}/* ${destination}/:splat 302!\n`;
      break;
    default:
      throw new Error('Choose a supported hosting platform.');
  }
  return {
    ...settings,
    platform,
    filename,
    instructions,
    configuration,
    entryExample: settings.website + settings.prefix + '/community?utm_source=website',
    targetExample: destination + '/community?utm_source=website',
  };
}
