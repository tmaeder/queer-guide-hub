import { SERVICE_DID } from '../_lib/feedGenerator';

// did:web document for queer.guide: names the Bluesky feed generator service.
export const onRequest: PagesFunction = () =>
  new Response(
    JSON.stringify({
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: SERVICE_DID,
      service: [
        { id: '#bsky_fg', type: 'BskyFeedGenerator', serviceEndpoint: 'https://queer.guide' },
      ],
    }),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
