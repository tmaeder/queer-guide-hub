import { useState, useEffect } from "react";
import { BeanHead } from "@beanheads/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Save } from "lucide-react";

interface AvatarBuilderProps {
  onSave: (avatarConfig: AvatarConfig) => void;
  initialConfig?: AvatarConfig;
}

export interface AvatarConfig {
  accessory: string;
  body: string;
  circleColor: string;
  clothing: string;
  clothingColor: string;
  eyebrows: string;
  eyes: string;
  facialHair: string;
  graphic: string;
  hair: string;
  hairColor: string;
  hat: string;
  hatColor: string;
  lashes: string;
  lipColor: string;
  mask: boolean;
  mouth: string;
  skinTone: string;
}

const avatarOptions = {
  accessory: ["none", "roundGlasses", "tinyGlasses", "shades"],
  body: ["chest", "breasts"],
  circleColor: ["blue", "orange", "red", "yellow", "green", "purple"],
  clothing: ["naked", "shirt", "dressShirt", "vneck", "tankTop", "dress"],
  clothingColor: ["white", "blue", "black", "green", "red"],
  eyebrows: ["raised", "leftLowered", "serious", "angry", "concerned"],
  eyes: ["normal", "leftTwitch", "happy", "content", "squint", "simple", "dizzy", "wink", "heart"],
  facialHair: ["none", "stubble", "mediumBeard"],
  graphic: ["none", "redwood", "gatsby", "vue", "react", "graphQL"],
  hair: ["none", "long", "bun", "short", "pixie", "balding", "buzz", "afro", "bob"],
  hairColor: ["blonde", "orange", "black", "white", "brown", "blue", "pink"],
  hat: ["none", "beanie", "turban"],
  hatColor: ["white", "blue", "black", "green", "red"],
  lashes: ["true", "false"],
  lipColor: ["red", "purple", "pink", "turqoise", "green"],
  mouth: ["grin", "sad", "openSmile", "lips", "open", "serious", "tongue"],
  skinTone: ["light", "yellow", "brown", "dark", "red", "black"]
};

const generateRandomConfig = (): AvatarConfig => ({
  accessory: avatarOptions.accessory[Math.floor(Math.random() * avatarOptions.accessory.length)],
  body: avatarOptions.body[Math.floor(Math.random() * avatarOptions.body.length)],
  circleColor: avatarOptions.circleColor[Math.floor(Math.random() * avatarOptions.circleColor.length)],
  clothing: avatarOptions.clothing[Math.floor(Math.random() * avatarOptions.clothing.length)],
  clothingColor: avatarOptions.clothingColor[Math.floor(Math.random() * avatarOptions.clothingColor.length)],
  eyebrows: avatarOptions.eyebrows[Math.floor(Math.random() * avatarOptions.eyebrows.length)],
  eyes: avatarOptions.eyes[Math.floor(Math.random() * avatarOptions.eyes.length)],
  facialHair: avatarOptions.facialHair[Math.floor(Math.random() * avatarOptions.facialHair.length)],
  graphic: avatarOptions.graphic[Math.floor(Math.random() * avatarOptions.graphic.length)],
  hair: avatarOptions.hair[Math.floor(Math.random() * avatarOptions.hair.length)],
  hairColor: avatarOptions.hairColor[Math.floor(Math.random() * avatarOptions.hairColor.length)],
  hat: avatarOptions.hat[Math.floor(Math.random() * avatarOptions.hat.length)],
  hatColor: avatarOptions.hatColor[Math.floor(Math.random() * avatarOptions.hatColor.length)],
  lashes: avatarOptions.lashes[Math.floor(Math.random() * avatarOptions.lashes.length)],
  lipColor: avatarOptions.lipColor[Math.floor(Math.random() * avatarOptions.lipColor.length)],
  mask: Math.random() > 0.5,
  mouth: avatarOptions.mouth[Math.floor(Math.random() * avatarOptions.mouth.length)],
  skinTone: avatarOptions.skinTone[Math.floor(Math.random() * avatarOptions.skinTone.length)],
});

export const AvatarBuilder = ({ onSave, initialConfig }: AvatarBuilderProps) => {
  const [config, setConfig] = useState<AvatarConfig>(initialConfig || generateRandomConfig());

  const updateConfig = (key: keyof AvatarConfig, value: string | boolean) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const randomize = () => {
    setConfig(generateRandomConfig());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Avatar Builder
          <Button variant="outline" onClick={randomize} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Randomize
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex justify-center mb-6">
          <div className="w-32 h-32">
            <BeanHead
              accessory={config.accessory}
              body={config.body}
              circleColor={config.circleColor}
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
              lashes={config.lashes === "true"}
              lipColor={config.lipColor}
              mask={config.mask}
              mouth={config.mouth}
              skinTone={config.skinTone}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {Object.entries(avatarOptions).map(([key, options]) => (
            <div key={key}>
              <label className="text-sm font-medium capitalize mb-2 block">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </label>
              <Select
                value={config[key as keyof AvatarConfig] as string}
                onValueChange={(value) => updateConfig(key as keyof AvatarConfig, value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <Button onClick={() => onSave(config)} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          Save Avatar
        </Button>
      </CardContent>
    </Card>
  );
};

export { generateRandomConfig };