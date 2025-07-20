import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Check, Globe, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
];

interface LanguageSwitcherProps {
  variant?: "default" | "compact";
  className?: string;
}

export function LanguageSwitcher({ variant = "default", className }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  const handleLanguageChange = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    setIsOpen(false);
  };

  if (variant === "compact") {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-2 text-sm", className)}
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">{currentLanguage.flag}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-2">
          <div className="grid gap-1">
            {languages.map((language) => (
              <Button
                key={language.code}
                variant="ghost"
                size="sm"
                className={cn(
                  "justify-start gap-2 text-sm",
                  currentLanguage.code === language.code && "bg-accent"
                )}
                onClick={() => handleLanguageChange(language.code)}
              >
                <span className="text-base">{language.flag}</span>
                <span className="flex-1 text-left">{language.name}</span>
                {currentLanguage.code === language.code && (
                  <Check className="h-3 w-3" />
                )}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4" />
        <span className="text-sm font-medium">{t('common.language')}</span>
      </div>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{currentLanguage.flag}</span>
              <span>{currentLanguage.name}</span>
            </div>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2">
          <div className="grid gap-1">
            {languages.map((language) => (
              <Button
                key={language.code}
                variant="ghost"
                className={cn(
                  "justify-start gap-2",
                  currentLanguage.code === language.code && "bg-accent"
                )}
                onClick={() => handleLanguageChange(language.code)}
              >
                <span className="text-base">{language.flag}</span>
                <span className="flex-1 text-left">{language.name}</span>
                {currentLanguage.code === language.code && (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}