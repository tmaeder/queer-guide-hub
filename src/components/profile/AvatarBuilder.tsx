import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Save } from "lucide-react";

interface AvatarBuilderProps {
  onSave: (avatarConfig: AvatarConfig) => void;
  initialConfig?: AvatarConfig;
}

export interface AvatarConfig {
  skinColor: string;
  hairStyle: string;
  hairColor: string;
  eyeStyle: string;
  eyeColor: string;
  noseStyle: string;
  mouthStyle: string;
  clothingStyle: string;
  clothingColor: string;
  accessory: string;
  facialHair: string;
  backgroundColor: string;
}

const avatarOptions = {
  skinColor: ["#F5D5B7", "#E8B894", "#D4A574", "#C4915C", "#A67B5B", "#8B6F47"],
  hairStyle: ["short", "long", "curly", "wavy", "buzz", "ponytail", "braid", "bun"],
  hairColor: ["#2C1B18", "#8B4513", "#D2691E", "#CD853F", "#F4A460", "#FFD700", "#FF69B4", "#00BFFF"],
  eyeStyle: ["normal", "wide", "sleepy", "wink", "surprised", "closed"],
  eyeColor: ["#8B4513", "#228B22", "#4169E1", "#808080", "#000000"],
  noseStyle: ["small", "medium", "large", "button", "pointed"],
  mouthStyle: ["smile", "neutral", "frown", "laugh", "open", "kiss"],
  clothingStyle: ["tshirt", "hoodie", "dress", "suit", "tank", "sweater"],
  clothingColor: ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500", "#800080"],
  accessory: ["none", "glasses", "sunglasses", "hat", "cap", "headband", "earrings"],
  facialHair: ["none", "mustache", "beard", "goatee", "stubble"],
  backgroundColor: ["#F0F8FF", "#E6E6FA", "#F5F5DC", "#FFE4E1", "#F0FFFF", "#F5FFFA"]
};

const generateRandomConfig = (): AvatarConfig => ({
  skinColor: avatarOptions.skinColor[Math.floor(Math.random() * avatarOptions.skinColor.length)],
  hairStyle: avatarOptions.hairStyle[Math.floor(Math.random() * avatarOptions.hairStyle.length)],
  hairColor: avatarOptions.hairColor[Math.floor(Math.random() * avatarOptions.hairColor.length)],
  eyeStyle: avatarOptions.eyeStyle[Math.floor(Math.random() * avatarOptions.eyeStyle.length)],
  eyeColor: avatarOptions.eyeColor[Math.floor(Math.random() * avatarOptions.eyeColor.length)],
  noseStyle: avatarOptions.noseStyle[Math.floor(Math.random() * avatarOptions.noseStyle.length)],
  mouthStyle: avatarOptions.mouthStyle[Math.floor(Math.random() * avatarOptions.mouthStyle.length)],
  clothingStyle: avatarOptions.clothingStyle[Math.floor(Math.random() * avatarOptions.clothingStyle.length)],
  clothingColor: avatarOptions.clothingColor[Math.floor(Math.random() * avatarOptions.clothingColor.length)],
  accessory: avatarOptions.accessory[Math.floor(Math.random() * avatarOptions.accessory.length)],
  facialHair: avatarOptions.facialHair[Math.floor(Math.random() * avatarOptions.facialHair.length)],
  backgroundColor: avatarOptions.backgroundColor[Math.floor(Math.random() * avatarOptions.backgroundColor.length)]
});

const AvatarPreview = ({ config }: { config: AvatarConfig }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Face (circle)
    ctx.fillStyle = config.skinColor;
    ctx.beginPath();
    ctx.arc(80, 90, 50, 0, 2 * Math.PI);
    ctx.fill();

    // Hair
    ctx.fillStyle = config.hairColor;
    ctx.beginPath();
    switch (config.hairStyle) {
      case 'short':
        ctx.arc(80, 75, 35, Math.PI, 2 * Math.PI);
        break;
      case 'long':
        ctx.arc(80, 70, 40, Math.PI, 2 * Math.PI);
        ctx.fillRect(40, 70, 80, 30);
        break;
      case 'curly':
        for (let i = 0; i < 5; i++) {
          ctx.arc(50 + i * 15, 60 + Math.sin(i) * 5, 8, 0, 2 * Math.PI);
        }
        break;
      default:
        ctx.arc(80, 75, 35, Math.PI, 2 * Math.PI);
    }
    ctx.fill();

    // Eyes
    ctx.fillStyle = config.eyeColor;
    const eyeY = 80;
    if (config.eyeStyle === 'closed') {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(65, eyeY);
      ctx.lineTo(75, eyeY);
      ctx.moveTo(85, eyeY);
      ctx.lineTo(95, eyeY);
      ctx.stroke();
    } else if (config.eyeStyle === 'wink') {
      ctx.beginPath();
      ctx.arc(70, eyeY, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(85, eyeY);
      ctx.lineTo(95, eyeY);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(70, eyeY, 3, 0, 2 * Math.PI);
      ctx.arc(90, eyeY, 3, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Nose
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, 85);
    ctx.lineTo(82, 95);
    ctx.stroke();

    // Mouth
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const mouthY = 105;
    switch (config.mouthStyle) {
      case 'smile':
        ctx.arc(80, mouthY - 5, 10, 0, Math.PI);
        break;
      case 'frown':
        ctx.arc(80, mouthY + 5, 10, Math.PI, 2 * Math.PI);
        break;
      case 'laugh':
        ctx.arc(80, mouthY - 8, 15, 0, Math.PI);
        break;
      case 'open':
        ctx.arc(80, mouthY, 5, 0, 2 * Math.PI);
        break;
      default:
        ctx.moveTo(75, mouthY);
        ctx.lineTo(85, mouthY);
    }
    ctx.stroke();

    // Clothing (simplified as a rectangle at bottom)
    ctx.fillStyle = config.clothingColor;
    ctx.fillRect(40, 130, 80, 30);

    // Accessories
    if (config.accessory === 'glasses') {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(70, 80, 8, 0, 2 * Math.PI);
      ctx.arc(90, 80, 8, 0, 2 * Math.PI);
      ctx.moveTo(78, 80);
      ctx.lineTo(82, 80);
      ctx.stroke();
    } else if (config.accessory === 'hat') {
      ctx.fillStyle = '#4B0082';
      ctx.fillRect(60, 45, 40, 20);
      ctx.fillRect(55, 35, 50, 10);
    }

    // Facial Hair
    if (config.facialHair === 'mustache') {
      ctx.fillStyle = config.hairColor;
      ctx.fillRect(75, 98, 10, 3);
    } else if (config.facialHair === 'beard') {
      ctx.fillStyle = config.hairColor;
      ctx.beginPath();
      ctx.arc(80, 115, 15, 0, Math.PI);
      ctx.fill();
    }
  }, [config]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={160}
      className="border rounded-lg"
      style={{ width: '128px', height: '128px' }}
    />
  );
};

export const AvatarBuilder = ({ onSave, initialConfig }: AvatarBuilderProps) => {
  const [config, setConfig] = useState<AvatarConfig>(initialConfig || generateRandomConfig());

  const updateConfig = (key: keyof AvatarConfig, value: string) => {
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
          <AvatarPreview config={config} />
        </div>

        <div className="grid grid-cols-2 gap-4 max-h-96 overflow-y-auto">
          {Object.entries(avatarOptions).map(([key, options]) => (
            <div key={key}>
              <label className="text-sm font-medium capitalize mb-2 block">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </label>
              <Select
                value={config[key as keyof AvatarConfig]}
                onValueChange={(value) => updateConfig(key as keyof AvatarConfig, value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option: string) => (
                    <SelectItem key={option} value={option}>
                      <div className="flex items-center gap-2">
                        {(key.includes('Color') || key === 'backgroundColor') && (
                          <div
                            className="w-4 h-4 rounded border"
                            style={{ backgroundColor: option }}
                          />
                        )}
                        {option}
                      </div>
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