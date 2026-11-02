import * as Notifications from 'expo-notifications';
import type { PushDeps } from './push';

/** The real OS hooks. Kept apart from push.ts so the rules are testable without native modules. */
export const nativePush: PushDeps = {
  async requestPermission() {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const next = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    return next.granted;
  },
  async getDeviceToken() {
    const t = await Notifications.getDevicePushTokenAsync();
    return typeof t.data === 'string' ? t.data : JSON.stringify(t.data);
  },
  unregisterDevice: () => Notifications.unregisterForNotificationsAsync(),
};
