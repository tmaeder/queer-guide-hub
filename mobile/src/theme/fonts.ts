import { Anton_400Regular } from '@expo-google-fonts/anton';
import { SpaceGrotesk_400Regular, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import type { TextStyle } from 'react-native';

/**
 * The web's type pairing (src/index.css): Anton for display headings,
 * Space Grotesk for everything else. The web ships woff2 only; these are the
 * same OFL families as ttf from @expo-google-fonts.
 *
 * One family name per weight: Android does not pick a weight out of a
 * custom family, it fakes bold, so weight is chosen here by family.
 */
export const FONT = {
  display: 'Anton',
  regular: 'SpaceGrotesk-Regular',
  bold: 'SpaceGrotesk-Bold',
} as const;

export const FONT_ASSETS = {
  [FONT.display]: Anton_400Regular,
  [FONT.regular]: SpaceGrotesk_400Regular,
  [FONT.bold]: SpaceGrotesk_700Bold,
};

export type TextVariant = 'display' | 'headline' | 'title' | 'body' | 'small' | 'eyebrow';

const isBold = (w: TextStyle['fontWeight']) =>
  w === 'bold' || (w != null && w !== 'normal' && Number(w) >= 600);

/**
 * Resolve the family for a variant and an optional weight override, and drop
 * fontWeight so no platform synthesises a second bold on top of it.
 */
export function fontStyle(variant: TextVariant, weight?: TextStyle['fontWeight']): TextStyle {
  if (variant === 'display' || variant === 'headline') {
    // Anton is single-weight; never faux-bold it, never letterspace it apart.
    return { fontFamily: FONT.display, fontWeight: 'normal', letterSpacing: 0 };
  }
  const bold = weight != null ? isBold(weight) : variant === 'title' || variant === 'eyebrow';
  return { fontFamily: bold ? FONT.bold : FONT.regular, fontWeight: 'normal' };
}
