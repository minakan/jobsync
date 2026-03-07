import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { apiClient } from '../api/client';

type SupportedRoute = '/(tabs)' | '/(tabs)/index';

let handlersInitialized = false;

const resolveRoute = (data: Record<string, unknown>): SupportedRoute => {
  const route = data.route;

  if (route === '/(tabs)' || route === '/(tabs)/index') {
    return route;
  }

  return '/(tabs)';
};

export async function requestPermissions(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    let finalStatus = current.status;

    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
      });
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.error('Failed to request notification permission', error);
    return false;
  }
}

export async function getDeviceToken(): Promise<string | null> {
  try {
    const granted = await requestPermissions();
    if (!granted) {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenResponse.data;
  } catch (error) {
    console.error('Failed to get push token', error);
    return null;
  }
}

export function setupNotificationHandlers(): void {
  if (handlersInitialized) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    const route = resolveRoute(response.notification.request.content.data);
    router.push(route);
  });

  handlersInitialized = true;
}

export async function registerTokenToServer(token: string): Promise<void> {
  await apiClient.patch('/users/me/fcm-token', { fcm_token: token });
}
