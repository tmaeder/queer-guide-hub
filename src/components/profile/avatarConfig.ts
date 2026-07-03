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
};

export const generateRandomConfig = (): AvatarConfig => ({
  accessory: avatarOptions.accessory[
    Math.floor(Math.random() * avatarOptions.accessory.length)
  ] as AvatarConfig['accessory'],
  body: avatarOptions.body[
    Math.floor(Math.random() * avatarOptions.body.length)
  ] as AvatarConfig['body'],
  clothing: avatarOptions.clothing[
    Math.floor(Math.random() * avatarOptions.clothing.length)
  ] as AvatarConfig['clothing'],
  clothingColor: avatarOptions.clothingColor[
    Math.floor(Math.random() * avatarOptions.clothingColor.length)
  ] as AvatarConfig['clothingColor'],
  eyebrows: avatarOptions.eyebrows[
    Math.floor(Math.random() * avatarOptions.eyebrows.length)
  ] as AvatarConfig['eyebrows'],
  eyes: avatarOptions.eyes[
    Math.floor(Math.random() * avatarOptions.eyes.length)
  ] as AvatarConfig['eyes'],
  facialHair: avatarOptions.facialHair[
    Math.floor(Math.random() * avatarOptions.facialHair.length)
  ] as AvatarConfig['facialHair'],
  graphic: avatarOptions.graphic[
    Math.floor(Math.random() * avatarOptions.graphic.length)
  ] as AvatarConfig['graphic'],
  hair: avatarOptions.hair[
    Math.floor(Math.random() * avatarOptions.hair.length)
  ] as AvatarConfig['hair'],
  hairColor: avatarOptions.hairColor[
    Math.floor(Math.random() * avatarOptions.hairColor.length)
  ] as AvatarConfig['hairColor'],
  hat: avatarOptions.hat[
    Math.floor(Math.random() * avatarOptions.hat.length)
  ] as AvatarConfig['hat'],
  hatColor: avatarOptions.hatColor[
    Math.floor(Math.random() * avatarOptions.hatColor.length)
  ] as AvatarConfig['hatColor'],
  lashes: avatarOptions.lashes[Math.floor(Math.random() * avatarOptions.lashes.length)] as boolean,
  lipColor: avatarOptions.lipColor[
    Math.floor(Math.random() * avatarOptions.lipColor.length)
  ] as AvatarConfig['lipColor'],
  mask: avatarOptions.mask[Math.floor(Math.random() * avatarOptions.mask.length)] as boolean,
  mouth: avatarOptions.mouth[
    Math.floor(Math.random() * avatarOptions.mouth.length)
  ] as AvatarConfig['mouth'],
  skinTone: avatarOptions.skinTone[
    Math.floor(Math.random() * avatarOptions.skinTone.length)
  ] as AvatarConfig['skinTone'],
  circleColor: 'blue',
});
