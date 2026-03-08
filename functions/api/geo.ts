/**
 * CF Pages Function: Returns visitor geo data from Cloudflare's request object.
 * Replaces ipapi.co — zero external calls, data stays in trust boundary.
 */
export const onRequest: PagesFunction = async (context) => {
  const cf = (context.request as any).cf || {};
  return new Response(
    JSON.stringify({
      latitude: cf.latitude ? parseFloat(cf.latitude) : null,
      longitude: cf.longitude ? parseFloat(cf.longitude) : null,
      city: cf.city ?? null,
      country: cf.country ?? null,
      region: cf.region ?? null,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=3600',
      },
    },
  );
};
