import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.637b2c375ce34dc7b7db4e56e05c682f',
  appName: 'queer-guide-hub',
  webDir: 'dist',
  server: {
    url: 'https://637b2c37-5ce3-4dc7-b7db-4e56e05c682f.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;