import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ANDROID_CHANNEL_ID = 'default';

const requestPermissions = async (): Promise<boolean> => {
  try {
    const current = await Notifications.getPermissionsAsync();
    let finalStatus = current.status;

    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.error('Failed to request notification permission', error);
    return false;
  }
};

const ensureAndroidChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563EB',
  });
};

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.info('Push token registration skipped because a physical device is required.');
    return null;
  }

  const granted = await requestPermissions();
  if (!granted) {
    return null;
  }

  try {
    await ensureAndroidChannel();
    const token = await Notifications.getDevicePushTokenAsync();

    // Backend sends with firebase_admin.messaging, so an FCM registration token is required.
    if (token.type !== 'fcm') {
      console.warn(`Unsupported native push token type: ${token.type}`);
      return null;
    }

    if (typeof token.data !== 'string' || token.data.trim().length === 0) {
      return null;
    }

    return token.data;
  } catch (error) {
    console.error('Failed to get native push token', error);
    return null;
  }
}
