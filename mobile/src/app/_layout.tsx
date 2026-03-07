/**
 * ルートレイアウト — 認証状態に応じてルーティングを制御する
 *
 * 認証済み  → (tabs)/ ホーム画面
 * 未認証    → auth/ ログイン画面
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const segments = useSegments();
  const [isMounted, setIsMounted] = useState(false);

  // ナビゲーションはマウント後にのみ実行できる
  useEffect(() => {
    setIsMounted(true);
  }, []);

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
          <Stack.Screen name="auth" />
        </Stack>
      </AuthGate>
    </QueryClientProvider>
  );
}
