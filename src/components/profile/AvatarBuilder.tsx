import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Save } from "lucide-react";

interface AvatarBuilderProps {
  onSave: (avatarConfig: AvatarConfig) => void;
  initialConfig?: AvatarConfig;
}

export interface AvatarConfig {
  background: string;
  face: string;
  hair: string;
  shirt: string;
  accessory: string;
  eyes: string;
  mouth: string;
}

const avatarOptions = {
  background: ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"],
  face: ["#fbbf24", "#f87171", "#34d399", "#60a5fa", "#a78bfa", "#fb7185"],
  hair: ["short", "long", "curly", "straight", "bald", "ponytail"],
  shirt: ["casual", "formal", "hoodie", "tshirt", "tank", "sweater"],
  accessory: ["none", "glasses", "hat", "earrings", "necklace", "sunglasses"],
  eyes: ["normal", "happy", "sleepy", "surprised", "wink", "closed"],
  mouth: ["smile", "neutral", "laugh", "frown", "open", "kiss"]
};

const generateRandomConfig = (): AvatarConfig => ({
  background: avatarOptions.background[Math.floor(Math.random() * avatarOptions.background.length)],
  face: avatarOptions.face[Math.floor(Math.random() * avatarOptions.face.length)],
  hair: avatarOptions.hair[Math.floor(Math.random() * avatarOptions.hair.length)],
  shirt: avatarOptions.shirt[Math.floor(Math.random() * avatarOptions.shirt.length)],
  accessory: avatarOptions.accessory[Math.floor(Math.random() * avatarOptions.accessory.length)],
  eyes: avatarOptions.eyes[Math.floor(Math.random() * avatarOptions.eyes.length)],
  mouth: avatarOptions.mouth[Math.floor(Math.random() * avatarOptions.mouth.length)],
});

export const AvatarBuilder = ({ onSave, initialConfig }: AvatarBuilderProps) => {
  const [config, setConfig] = useState<AvatarConfig>(initialConfig || generateRandomConfig());

  const updateConfig = (key: keyof AvatarConfig, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const randomize = () => {
    setConfig(generateRandomConfig());
  };

  const renderAvatarPreview = () => {
    const hairEmoji = {
      short: "👨‍🦲",
      long: "👨‍🦱",
      curly: "👨‍🦱",
      straight: "👨",
      bald: "👨‍🦲",
      ponytail: "👩‍🦰"
    };

    const eyesEmoji = {
      normal: "👀",
      happy: "😊",
      sleepy: "😴",
      surprised: "😮",
      wink: "😉",
      closed: "😌"
    };

    const mouthEmoji = {
      smile: "😊",
      neutral: "😐",
      laugh: "😂",
      frown: "☹️",
      open: "😮",
      kiss: "😘"
    };

    const accessoryEmoji = {
      none: "",
      glasses: "👓",
      hat: "🎩",
      earrings: "💎",
      necklace: "📿",
      sunglasses: "🕶️"
    };

    return (
      <div className="relative">
        <div 
          className="w-32 h-32 rounded-full flex items-center justify-center text-4xl overflow-hidden border-4 border-white shadow-lg"
          style={{ backgroundColor: config.background, color: config.face }}
        >
          <div className="flex flex-col items-center">
            <div className="text-2xl mb-1">
              {hairEmoji[config.hair as keyof typeof hairEmoji] || "👤"}
            </div>
            <div className="flex gap-1 text-lg">
              <span>{eyesEmoji[config.eyes as keyof typeof eyesEmoji] || "👀"}</span>
              <span>{mouthEmoji[config.mouth as keyof typeof mouthEmoji] || "😊"}</span>
            </div>
            {accessoryEmoji[config.accessory as keyof typeof accessoryEmoji] && (
              <div className="text-sm mt-1">
                {accessoryEmoji[config.accessory as keyof typeof accessoryEmoji]}
              </div>
            )}
          </div>
        </div>
        <div 
          className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-2 px-3 py-1 rounded text-xs font-medium"
          style={{ backgroundColor: config.face, color: 'white' }}
        >
          {config.shirt}
        </div>
      </div>
    );
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
          {renderAvatarPreview()}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {Object.entries(avatarOptions).map(([key, options]) => (
            <div key={key}>
              <label className="text-sm font-medium capitalize mb-2 block">
                {key}
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