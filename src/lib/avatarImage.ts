import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BigHead } from '@bigheads/core';
import type { AvatarConfig } from '../components/profile/avatarConfig';

/**
 * A built (BigHeads) avatar as a standalone SVG string.
 *
 * Built avatars are stored as `avatar_config` only, while ~33 avatar render
 * sites read `avatar_url` alone — so every member with a built avatar showed a
 * letter everywhere except their own profile header. Rendering the config to
 * an image and storing it as `avatar_url` fixes every surface at once. Used by
 * the client (useProfile) and by scripts/data-quality/backfill-avatar-images.ts.
 */
export function avatarConfigToSvg(config: AvatarConfig, size = 256): string {
  return renderToStaticMarkup(createElement(BigHead, config)).replace(
    '<svg ',
    `<svg width="${size}" height="${size}" `,
  );
}
