import { SERVICE_DID, feedUri, xrpcJson, type FeedEnv } from '../_lib/feedGenerator';

export const onRequest: PagesFunction<FeedEnv> = ({ env }) => {
  const uri = feedUri(env);
  return xrpcJson({
    did: SERVICE_DID,
    feeds: uri ? [{ uri }] : [],
    links: {
      privacyPolicy: 'https://queer.guide/privacy',
      termsOfService: 'https://queer.guide/terms',
    },
  });
};
