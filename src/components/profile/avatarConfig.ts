// Shared BigHeads avatar config: the type + random generator used by the
// simplified choosers (AvatarChooser, AvatarQuickPick) and signup/claim flows.
// The former full 16-control <AvatarBuilder> UI was removed after the
// 2026-06-11 profile-settings redesign made it unreachable.

export interface AvatarConfig {
  accessory: 'none' | 'roundGlasses' | 'tinyGlasses' | 'shades';
  body: 'chest' | 'breasts';
  clothing: 'naked' | 'shirt' | 'dressShirt' | 'vneck' | 'tankTop' | 'dress';
  clothingColor: 'white' | 'blue' | 'black' | 'green' | 'red';
  eyebrows: 'raised' | 'leftLowered' | 'serious' | 'angry' | 'concerned';
  eyes:
    | 'content'
    | 'normal'
    | 'leftTwitch'
    | 'happy'
    | 'squint'
    | 'simple'
    | 'dizzy'
    | 'wink'
    | 'heart';
  facialHair: 'none' | 'none2' | 'none3' | 'stubble' | 'mediumBeard';
  graphic: 'none' | 'redwood' | 'gatsby' | 'vue' | 'react' | 'graphQL';
  hair: 'none' | 'long' | 'bun' | 'short' | 'pixie' | 'balding' | 'buzz' | 'afro' | 'bob';
  hairColor: 'white' | 'blue' | 'black' | 'blonde' | 'orange' | 'brown' | 'pink';
  hat: 'none' | 'none2' | 'none3' | 'none4' | 'none5' | 'beanie' | 'turban';
  hatColor: 'white' | 'blue' | 'black' | 'green' | 'red';
  lashes: boolean;
  lipColor: 'green' | 'red' | 'pink' | 'purple' | 'turqoise';
  mask: boolean;
  mouth: 'serious' | 'grin' | 'sad' | 'openSmile' | 'lips' | 'open' | 'tongue';
  skinTone: 'black' | 'red' | 'brown' | 'light' | 'yellow' | 'dark';
  circleColor: 'blue';
}

const avatarOptions = {
  accessory: ['none', 'roundGlasses', 'tinyGlasses', 'shades'],
  body: ['chest', 'breasts'],
  clothing: ['naked', 'shirt', 'dressShirt', 'vneck', 'tankTop', 'dress'],
  clothingColor: ['white', 'blue', 'black', 'green', 'red'],
  eyebrows: ['raised', 'leftLowered', 'serious', 'angry', 'concerned'],
  eyes: ['content', 'normal', 'leftTwitch', 'happy', 'squint', 'simple', 'dizzy', 'wink', 'heart'],
  facialHair: ['none', 'none2', 'none3', 'stubble', 'mediumBeard'],
  graphic: ['none', 'redwood', 'gatsby', 'vue', 'react', 'graphQL'],
  hair: ['none', 'long', 'bun', 'short', 'pixie', 'balding', 'buzz', 'afro', 'bob'],
  hairColor: ['white', 'blue', 'black', 'blonde', 'orange', 'brown', 'pink'],
  hat: ['none', 'none2', 'none3', 'none4', 'none5', 'beanie', 'turban'],
  hatColor: ['white', 'blue', 'black', 'green', 'red'],
  lashes: [true, false],
  lipColor: ['green', 'red', 'pink', 'purple', 'turqoise'],
  mask: [true, false],
  mouth: ['serious', 'grin', 'sad', 'openSmile', 'lips', 'open', 'tongue'],
  skinTone: ['black', 'red', 'brown', 'light', 'yellow', 'dark'],
  circleColor: ['blue'],
} as const;

const pick = <K extends keyof AvatarConfig>(key: K): AvatarConfig[K] => {
  const options = avatarOptions[key];
  return options[Math.floor(Math.random() * options.length)] as AvatarConfig[K];
};

export const generateRandomConfig = (): AvatarConfig => ({
  accessory: pick('accessory'),
  body: pick('body'),
  clothing: pick('clothing'),
  clothingColor: pick('clothingColor'),
  eyebrows: pick('eyebrows'),
  eyes: pick('eyes'),
  facialHair: pick('facialHair'),
  graphic: pick('graphic'),
  hair: pick('hair'),
  hairColor: pick('hairColor'),
  hat: pick('hat'),
  hatColor: pick('hatColor'),
  lashes: pick('lashes'),
  lipColor: pick('lipColor'),
  mask: pick('mask'),
  mouth: pick('mouth'),
  skinTone: pick('skinTone'),
  circleColor: 'blue',
});
