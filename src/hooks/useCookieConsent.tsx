import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface CookiePreferences {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

interface CookieConsentContextType {
  preferences: CookiePreferences | null;
  showBanner: boolean;
  acceptAll: () => void;
  acceptNecessary: () => void;
  updatePreferences: (prefs: CookiePreferences) => void;
  resetConsent: () => void;
  hasConsented: boolean;
}

const CookieConsentContext = createContext<CookieConsentContextType | undefined>(undefined);

const STORAGE_KEY = 'queer-guide-cookie-consent';
const CONSENT_VERSION = '1.0';

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<CookiePreferences | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.version === CONSENT_VERSION) {
          setPreferences(data.preferences);
          setHasConsented(true);
          setShowBanner(false);
          return;
        }
      } catch (error) {
        console.warn('Invalid cookie consent data:', error);
      }
    }
    
    // Show banner if no valid consent found
    setShowBanner(true);
  }, []);

  const savePreferences = (prefs: CookiePreferences) => {
    const data = {
      preferences: prefs,
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setPreferences(prefs);
    setHasConsented(true);
    setShowBanner(false);
    
    // Trigger custom event for analytics and other services
    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: prefs }));
  };

  const acceptAll = () => {
    const allAccepted: CookiePreferences = {
      necessary: true,
      functional: true,
      analytics: true,
      marketing: true,
    };
    savePreferences(allAccepted);
  };

  const acceptNecessary = () => {
    const necessaryOnly: CookiePreferences = {
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    };
    savePreferences(necessaryOnly);
  };

  const updatePreferences = (prefs: CookiePreferences) => {
    // Necessary cookies are always required
    const updatedPrefs = { ...prefs, necessary: true };
    savePreferences(updatedPrefs);
  };

  const resetConsent = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPreferences(null);
    setHasConsented(false);
    setShowBanner(true);
  };

  return (
    <CookieConsentContext.Provider
      value={{
        preferences,
        showBanner,
        acceptAll,
        acceptNecessary,
        updatePreferences,
        resetConsent,
        hasConsented,
      }}
    >
      {children}
    </CookieConsentContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCookieConsent() {
  const context = useContext(CookieConsentContext);
  if (context === undefined) {
    throw new Error('useCookieConsent must be used within a CookieConsentProvider');
  }
  return context;
}