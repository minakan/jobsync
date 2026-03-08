import { useMutation } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';

import { emailsApi } from '@/api/emails';
import { useAuthStore } from '@/stores/authStore';

WebBrowser.maybeCompleteAuthSession();

type DeepLinkValue = string | string[] | undefined;

const getSingleValue = (value: DeepLinkValue): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const parseEmailCallback = (
  url: string,
): {
  status?: string;
  taskId?: string;
} | null => {
  if (!url.startsWith('jobsync://emails/callback')) {
    return null;
  }

  const parsed = Linking.parse(url);
  const params = parsed.queryParams as Record<string, DeepLinkValue> | null;

  if (!params) {
    return {};
  }

  return {
    status: getSingleValue(params.status),
    taskId: getSingleValue(params.task_id),
  };
};

const showMessage = (title: string, message: string): void => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }

  Alert.alert(title, message);
};

export default function SettingsScreen() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const logout = useAuthStore((state) => state.logout);
  const [isGmailConnected, setIsGmailConnected] = useState(false);

  const handleEmailCallback = useCallback((url: string): void => {
    const parsed = parseEmailCallback(url);

    if (!parsed || parsed.status !== 'connected') {
      return;
    }

    setIsGmailConnected(true);
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleEmailCallback(url);
    });

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleEmailCallback(url);
      }
    });

    return () => subscription.remove();
  }, [handleEmailCallback]);

  const connectMutation = useMutation({
    mutationFn: () => emailsApi.connectGmail(),
  });

  const syncMutation = useMutation({
    mutationFn: () => emailsApi.sync(),
    onSuccess: ({ task_id }) => {
      setIsGmailConnected(true);
      showMessage('同期開始', `メール同期を開始しました (task_id: ${task_id})`);
    },
    onError: (error) => {
      console.error('Email sync error:', error);
      Alert.alert('同期エラー', 'メール同期に失敗しました。ネットワーク接続を確認してください。');
    },
  });

  const handleConnectPress = async (): Promise<void> => {
    if (!accessToken) {
      Alert.alert('認証エラー', 'セッションが無効です。再ログインしてください。');
      return;
    }

    try {
      const { oauth_url } = await connectMutation.mutateAsync();
      const result = await WebBrowser.openAuthSessionAsync(oauth_url, 'jobsync://emails/callback');

      if (result.type === 'success' && result.url) {
        handleEmailCallback(result.url);
      }
    } catch (error) {
      console.error('Gmail connect error:', error);
      Alert.alert('連携エラー', 'Gmail 連携に失敗しました。時間をおいて再試行してください。');
    }
  };

  const handleSyncPress = (): void => {
    if (!accessToken) {
      Alert.alert('認証エラー', 'セッションが無効です。再ログインしてください。');
      return;
    }

    syncMutation.mutate();
  };

  const handleLogout = (): void => {
    logout();
    router.replace('/auth');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>設定</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Gmail 連携</Text>
          <Text style={styles.sectionDescription}>
            Gmail を連携すると、選考メールを解析して予定を自動で取り込みます。
          </Text>

          {isGmailConnected ? (
            <>
              <View style={styles.connectedBadge}>
                <Text style={styles.connectedText}>連携済み ✓</Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  (pressed || syncMutation.isPending) && styles.buttonPressed,
                  syncMutation.isPending && styles.buttonDisabled,
                ]}
                onPress={handleSyncPress}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>同期する</Text>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || connectMutation.isPending) && styles.buttonPressed,
                (connectMutation.isPending || !accessToken) && styles.buttonDisabled,
              ]}
              onPress={handleConnectPress}
              disabled={connectMutation.isPending || !accessToken}
            >
              {connectMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Gmail を連携する</Text>
              )}
            </Pressable>
          )}
        </View>

        <Pressable style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>ログアウト</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 16 : 24,
    paddingBottom: 40,
    gap: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    padding: 18,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: '#9ca3af',
  },
  connectedBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#00B87C66',
    backgroundColor: '#00B87C22',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  connectedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7CFFD2',
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6C63FF',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  logoutButton: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a1f1f',
    backgroundColor: '#1a1111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ff9d9d',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
