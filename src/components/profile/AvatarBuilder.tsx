import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Save } from "lucide-react";
import { BigHead } from "@bigheads/core";

interface AvatarBuilderProps {
  onSave: (avatarConfig: AvatarConfig) => void;
  initialConfig?: AvatarConfig;
}

export interface AvatarConfig {
  accessory: "none" | "roundGlasses" | "tinyGlasses" | "shades";
  body: "chest" | "breasts";
  clothing: "naked" | "shirt" | "dressShirt" | "vneck" | "tankTop" | "dress";
  clothingColor: "white" | "blue" | "black" | "green" | "red";
  eyebrows: "raised" | "leftLowered" | "serious" | "angry" | "concerned";
  eyes: "content" | "normal" | "leftTwitch" | "happy" | "squint" | "simple" | "dizzy" | "wink" | "heart";
  facialHair: "none" | "none2" | "none3" | "stubble" | "mediumBeard";
  graphic: "none" | "redwood" | "gatsby" | "vue" | "react" | "graphQL";
  hair: "none" | "long" | "bun" | "short" | "pixie" | "balding" | "buzz" | "afro" | "bob";
  hairColor: "white" | "blue" | "black" | "blonde" | "orange" | "brown" | "pink";
  hat: "none" | "none2" | "none3" | "none4" | "none5" | "beanie" | "turban";
  hatColor: "white" | "blue" | "black" | "green" | "red";
  lashes: boolean;
  lipColor: "green" | "red" | "pink" | "purple" | "turqoise";
  mask: boolean;
  mouth: "serious" | "grin" | "sad" | "openSmile" | "lips" | "open" | "tongue";
  skinTone: "black" | "red" | "brown" | "light" | "yellow" | "dark";
  circleColor: "blue";
}

const avatarOptions = {
  accessory: ["none", "roundGlasses", "tinyGlasses", "shades"],
  body: ["chest", "breasts"],
  clothing: ["naked", "shirt", "dressShirt", "vneck", "tankTop", "dress"],
  clothingColor: ["white", "blue", "black", "green", "red"],
  eyebrows: ["raised", "leftLowered", "serious", "angry", "concerned"],
  eyes: ["content", "normal", "leftTwitch", "happy", "squint", "simple", "dizzy", "wink", "heart"],
  facialHair: ["none", "none2", "none3", "stubble", "mediumBeard"],
  graphic: ["none", "redwood", "gatsby", "vue", "react", "graphQL"],
  hair: ["none", "long", "bun", "short", "pixie", "balding", "buzz", "afro", "bob"],
  hairColor: ["white", "blue", "black", "blonde", "orange", "brown", "pink"],
  hat: ["none", "none2", "none3", "none4", "none5", "beanie", "turban"],
  hatColor: ["white", "blue", "black", "green", "red"],
  lashes: [true, false],
  lipColor: ["green", "red", "pink", "purple", "turqoise"],
  mask: [true, false],
  mouth: ["serious", "grin", "sad", "openSmile", "lips", "open", "tongue"],
  skinTone: ["black", "red", "brown", "light", "yellow", "dark"],
  circleColor: ["blue"]
};

const generateRandomConfig = (): AvatarConfig => ({
  accessory: avatarOptions.accessory[Math.floor(Math.random() * avatarOptions.accessory.length)] as AvatarConfig["accessory"],
  body: avatarOptions.body[Math.floor(Math.random() * avatarOptions.body.length)] as AvatarConfig["body"],
  clothing: avatarOptions.clothing[Math.floor(Math.random() * avatarOptions.clothing.length)] as AvatarConfig["clothing"],
  clothingColor: avatarOptions.clothingColor[Math.floor(Math.random() * avatarOptions.clothingColor.length)] as AvatarConfig["clothingColor"],
  eyebrows: avatarOptions.eyebrows[Math.floor(Math.random() * avatarOptions.eyebrows.length)] as AvatarConfig["eyebrows"],
  eyes: avatarOptions.eyes[Math.floor(Math.random() * avatarOptions.eyes.length)] as AvatarConfig["eyes"],
  facialHair: avatarOptions.facialHair[Math.floor(Math.random() * avatarOptions.facialHair.length)] as AvatarConfig["facialHair"],
  graphic: avatarOptions.graphic[Math.floor(Math.random() * avatarOptions.graphic.length)] as AvatarConfig["graphic"],
  hair: avatarOptions.hair[Math.floor(Math.random() * avatarOptions.hair.length)] as AvatarConfig["hair"],
  hairColor: avatarOptions.hairColor[Math.floor(Math.random() * avatarOptions.hairColor.length)] as AvatarConfig["hairColor"],
  hat: avatarOptions.hat[Math.floor(Math.random() * avatarOptions.hat.length)] as AvatarConfig["hat"],
  hatColor: avatarOptions.hatColor[Math.floor(Math.random() * avatarOptions.hatColor.length)] as AvatarConfig["hatColor"],
  lashes: avatarOptions.lashes[Math.floor(Math.random() * avatarOptions.lashes.length)] as boolean,
  lipColor: avatarOptions.lipColor[Math.floor(Math.random() * avatarOptions.lipColor.length)] as AvatarConfig["lipColor"],
  mask: avatarOptions.mask[Math.floor(Math.random() * avatarOptions.mask.length)] as boolean,
  mouth: avatarOptions.mouth[Math.floor(Math.random() * avatarOptions.mouth.length)] as AvatarConfig["mouth"],
  skinTone: avatarOptions.skinTone[Math.floor(Math.random() * avatarOptions.skinTone.length)] as AvatarConfig["skinTone"],
  circleColor: "blue"
});

export const AvatarBuilder = ({ onSave, initialConfig }: AvatarBuilderProps) => {
  const [config, setConfig] = useState<AvatarConfig>(initialConfig || generateRandomConfig());

  const updateConfig = (key: keyof AvatarConfig, value: AvatarConfig[keyof AvatarConfig]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const randomize = () => {
    setConfig(generateRandomConfig());
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h6 className="text-lg font-semibold">Avatar Builder</h6>
          <Button variant="outline" onClick={randomize} size="sm">
            <RefreshCw style={{ width: 16, height: 16, marginRight: 8 }} />
            Randomize
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          <div className="flex justify-center mb-6">
            <div style={{ width: 128, height: 128 }}>
              <BigHead
                accessory={config.accessory}
                body={config.body}
                clothing={config.clothing}
                clothingColor={config.clothingColor}
                eyebrows={config.eyebrows}
                eyes={config.eyes}
                facialHair={config.facialHair}
                graphic={config.graphic}
                hair={config.hair}
                hairColor={config.hairColor}
                hat={config.hat}
                hatColor={config.hatColor}
                lashes={config.lashes}
                lipColor={config.lipColor}
                mask={config.mask}
                mouth={config.mouth}
                skinTone={config.skinTone}
                circleColor={config.circleColor}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 overflow-y-auto" style={{ maxHeight: 384 }}>
            {Object.entries(avatarOptions).map(([key, options]) => (
              <div key={key}>
                <p className="text-sm font-medium capitalize mb-2 block">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </p>
                <Select
                  value={String(config[key as keyof AvatarConfig])}
                  onValueChange={(value) => {
                    const parsedValue = key === 'lashes' || key === 'mask' ? value === 'true' : value;
                    updateConfig(key as keyof AvatarConfig, parsedValue);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option: string | boolean) => (
                      <SelectItem key={String(option)} value={String(option)}>
                        <span className="flex items-center gap-2">
                          {key.includes('Color') && typeof option === 'string' && (
                            <span
                              className="rounded"
                              style={{ width: 16, height: 16, backgroundColor: option, display: 'inline-block' }}
                            />
                          )}
                          {String(option)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <Button onClick={() => onSave(config)} style={{ width: '100%' }}>
            <Save style={{ width: 16, height: 16, marginRight: 8 }} />
            Save Avatar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export { generateRandomConfig };
