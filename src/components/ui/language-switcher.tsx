import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Globe, ChevronDown } from "lucide-react";

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

export function LanguageSwitcher({ variant = "default" }: LanguageSwitcherProps) {
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
            style={{ display: 'flex', gap: 8, fontSize: '0.875rem', alignItems: 'center' }}
          >
            <Globe style={{ height: 16, width: 16 }} />
            <span>{currentLanguage.flag}</span>
            <ChevronDown style={{ height: 12, width: 12 }} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" style={{ width: 192, padding: 8 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            {languages.map((language) => (
              <Button
                key={language.code}
                variant="ghost"
                size="sm"
                style={{
                  justifyContent: 'flex-start',
                  gap: 8,
                  fontSize: '0.875rem',
                  width: '100%',
                  ...(currentLanguage.code === language.code ? { backgroundColor: 'var(--mui-palette-action-hover, rgba(0,0,0,0.04))' } : {}),
                }}
                onClick={() => handleLanguageChange(language.code)}
              >
                <span style={{ fontSize: '1rem' }}>{language.flag}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{language.name}</span>
                {currentLanguage.code === language.code && (
                  <Check style={{ height: 12, width: 12 }} />
                )}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Globe style={{ height: 16, width: 16 }} />
        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{t('common.language')}</span>
      </div>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1rem' }}>{currentLanguage.flag}</span>
              <span>{currentLanguage.name}</span>
            </div>
            <ChevronDown style={{ height: 16, width: 16 }} />
          </Button>
        </PopoverTrigger>
        <PopoverContent style={{ width: 224, padding: 8 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            {languages.map((language) => (
              <Button
                key={language.code}
                variant="ghost"
                style={{
                  justifyContent: 'flex-start',
                  gap: 8,
                  width: '100%',
                  ...(currentLanguage.code === language.code ? { backgroundColor: 'var(--mui-palette-action-hover, rgba(0,0,0,0.04))' } : {}),
                }}
                onClick={() => handleLanguageChange(language.code)}
              >
                <span style={{ fontSize: '1rem' }}>{language.flag}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{language.name}</span>
                {currentLanguage.code === language.code && (
                  <Check style={{ height: 16, width: 16 }} />
                )}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
