import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'guide.queer.app',
  appName: 'Queer Guide',
  webDir: 'dist',
  server: {
    url: 'https://queer.guide',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;