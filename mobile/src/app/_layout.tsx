/**
 * ルートレイアウト — 認証状態に応じてルーティングを制御する
 *
 * 認証済み  → (tabs)/ ホーム画面
 * 未認証    → auth/ ログイン画面
 */

import * as Linking from 'expo-linking';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack, useSegments } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, ToastAndroid } from 'react-native';

import { useAuthStore } from '@/stores/authStore';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const segments = useSegments();
  const [isMounted, setIsMounted] = useState(false);
  const lastHandledUrlRef = useRef<string | null>(null);

  // ナビゲーションはマウント後にのみ実行できる
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const notifyGmailConnected = useCallback((): void => {
    const message = 'Gmail 連携完了';

    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }

    Alert.alert('連携完了', message);
  }, []);

  const handleDeepLink = useCallback(
    (url: string): void => {
      if (!url.startsWith('jobsync://emails/callback')) {
        return;
      }

      if (lastHandledUrlRef.current === url) {
        return;
      }

      lastHandledUrlRef.current = url;

      const parsed = Linking.parse(url);
      const params = parsed.queryParams as Record<string, string | string[] | undefined> | null;
      const rawStatus = params?.status;
      const status = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;

      if (status === 'connected') {
        notifyGmailConnected();
      }
    },
    [notifyGmailConnected],
  );

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    return () => subscription.remove();
  }, [handleDeepLink]);

  useEffect(() => {
    if (!isMounted) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!isAuthenticated && !inAuthGroup) {
      // 未認証 → ログイン画面へ
      router.replace('/auth');
    } else if (isAuthenticated && inAuthGroup) {
      // 認証済み → ホーム画面へ
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, isMounted]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000, // 30秒
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth/index" />
        </Stack>
      </AuthGate>
    </QueryClientProvider>
  );
}
