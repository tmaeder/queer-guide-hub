/* eslint-disable react-refresh/only-export-components -- intentionally co-locates helpers/constants with the primary component */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

function icon(d: string, name: string) {
  const Icon = ({ size = 24, width, height, ...props }: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width ?? size}
      height={height ?? size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={d} />
    </svg>
  );
  Icon.displayName = name;
  return Icon;
}

export const Instagram = ({ size = 24, width, height, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width ?? size}
    height={height ?? size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);
Instagram.displayName = 'Instagram';

export const Facebook = icon(
  'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z',
  'Facebook'
);

export const Twitter = icon(
  'M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z',
  'Twitter'
);

export const Linkedin = ({ size = 24, width, height, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width ?? size}
    height={height ?? size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);
Linkedin.displayName = 'Linkedin';

export const Youtube = ({ size = 24, width, height, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width ?? size}
    height={height ?? size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <path d="m10 15 5-3-5-3z" />
  </svg>
);
Youtube.displayName = 'Youtube';

export const Github = ({ size = 24, width, height, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width ?? size}
    height={height ?? size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);
Github.displayName = 'Github';

export const TikTok = icon(
  'M9 12a4 4 0 1 0 4 4V4c.5 2.5 2.5 4.5 5 5',
  'TikTok'
);

export const Threads = icon(
  'M16 8.5c-1-2-2.5-3-4-3-3 0-4.5 2.5-4.5 6.5s1.5 6.5 4.5 6.5c2.2 0 3.5-1.4 3.5-3.2 0-2-1.5-3.3-3.7-3.3-1.4 0-2.3.7-2.3 1.8s.8 1.7 1.9 1.7c1.3 0 2.1-1 2.1-2.7',
  'Threads'
);

export const Bluesky = icon(
  'M12 10.8C10.7 8.4 7.5 5.5 5.5 5c-1.3-.3-2 .4-2 1.8 0 1 .9 4.3 1.4 5 .7.9 1.9 1.2 3.6 1-1.7.3-3 .9-2.4 2.7.6 1.7 2.6 3 4.3.3 1.7 2.7 3.7 1.4 4.3-.3.6-1.8-.7-2.4-2.4-2.7 1.7.2 2.9-.1 3.6-1 .5-.7 1.4-4 1.4-5 0-1.4-.7-2.1-2-1.8-2 .5-5.2 3.4-6.5 5.8z',
  'Bluesky'
);

export const Mastodon = icon(
  'M18.5 13.5c-.4 2-3.4 2.6-6.5 2.6-2 0-4-.2-4-.2m0 2.5c1 1.5 3 1.6 4 1.6 3 0 5.5-.6 6-2M7 13V8c0-2 1.5-3 3-3s2 1 2 2.5V11m0-3.5C12 6 13 5 14.5 5s3 1 3 3v5',
  'Mastodon'
);

export const Spotify = icon(
  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M7.5 10c3-1 6.5-.5 9 1m-8 2.2c2.3-.7 4.8-.4 6.8.8m-6 2.1c1.7-.5 3.4-.3 5 .6',
  'Spotify'
);
