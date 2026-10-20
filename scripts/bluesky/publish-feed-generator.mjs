#!/usr/bin/env node
// One-time: publish the "Queer Guide" feed generator record so the feed shows
// up in Bluesky. Run with the official account's credentials (an app password,
// never the main password):
//
//   BLUESKY_HANDLE=queerguide.bsky.social BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
//     node scripts/bluesky/publish-feed-generator.mjs
//
// Then set FEED_PUBLISHER_DID (printed below) as a Cloudflare Pages env var so
// describeFeedGenerator lists the feed and getFeedSkeleton accepts only it.
import { AtpAgent } from '@atproto/api';

const handle = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_APP_PASSWORD;
if (!handle || !password) {
  console.error('Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD (an app password).');
  process.exit(2);
}

const agent = new AtpAgent({ service: 'https://bsky.social' });
await agent.login({ identifier: handle, password });
const res = await agent.com.atproto.repo.putRecord({
  repo: agent.session.did,
  collection: 'app.bsky.feed.generator',
  rkey: 'queer-guide',
  record: {
    $type: 'app.bsky.feed.generator',
    did: 'did:web:queer.guide',
    displayName: 'Queer Guide',
    description:
      'Posts members of queer.guide chose to share on Bluesky: queer travel, venues, events and community.',
    createdAt: new Date().toISOString(),
  },
});
console.log('Published', res.data.uri);
console.log('FEED_PUBLISHER_DID =', agent.session.did);
