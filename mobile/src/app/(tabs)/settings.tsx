import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { usersApi } from '@/api/users';
import { useAuthStore } from '@/stores/authStore';

const FORWARDING_STEPS: { title: string; description: string }[] = [
  {
    title: 'STEP 1: 転送アドレスをコピー',
    description: '上のアドレスをコピーしてください',
  },
  {
    title: 'STEP 2: Gmailの設定を開く',
    description:
      'Gmailアプリ → 設定 → アカウント → メール転送\nまたは Gmail（PC）→ 設定 → 転送とPOP/IMAP',
  },
  {
    title: 'STEP 3: 転送先を追加',
    description: '「転送先アドレスを追加」でコピーしたアドレスを入力',
  },
  {
    title: 'STEP 4: 確認メールを承認',
    description:
      'Gmailから確認メールが届きます\nJobSyncが自動的に承認するので、そのままお待ちください（1〜2分）',
  },
  {
    title: 'STEP 5: フィルタを設定（推奨）',
    description:
      '就活関連メールだけを転送するフィルタを設定すると効率的です\n条件例: to:(あなたの就活用アドレス) または 件名に「選考」「面接」を含む',
  },
];

const MONOSPACE_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export default function SettingsScreen() {
  const logout = useAuthStore((state) => state.logout);
  const [isCopied, setIsCopied] = useState(false);
  const forwardingAddressQuery = useQuery({
    queryKey: ['forwarding-address'],
    queryFn: usersApi.getForwardingAddress,
  });

  useEffect(() => {
    if (!isCopied) {
      return;
    }

    const timer = setTimeout(() => {
      setIsCopied(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, [isCopied]);

  const handleCopyPress = async (): Promise<void> => {
    const address = forwardingAddressQuery.data?.forwarding_email;

    if (!address) {
      return;
    }

    await Clipboard.setStringAsync(address);
    setIsCopied(true);
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
            Gmailの自動転送を設定すると、選考メールを解析して予定を自動で取り込みます。
          </Text>

          {forwardingAddressQuery.isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          ) : forwardingAddressQuery.isError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>アドレスを取得できませんでした</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  (pressed || forwardingAddressQuery.isFetching) && styles.buttonPressed,
                  forwardingAddressQuery.isFetching && styles.buttonDisabled,
                ]}
                onPress={() => {
                  void forwardingAddressQuery.refetch();
                }}
                disabled={forwardingAddressQuery.isFetching}
              >
                {forwardingAddressQuery.isFetching ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>再試行</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.addressBox}>
                <Text style={styles.addressLabel}>転送先アドレス</Text>
                <Text style={styles.addressText}>
                  {forwardingAddressQuery.data?.forwarding_email ?? ''}
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                onPress={() => {
                  void handleCopyPress();
                }}
              >
                <Text style={styles.primaryButtonText}>{isCopied ? 'コピーしました' : 'コピー'}</Text>
              </Pressable>
            </>
          )}

          <View style={styles.guideCard}>
            <Text style={styles.guideTitle}>【Gmailで転送設定する手順】</Text>
            {FORWARDING_STEPS.map((step) => (
              <View key={step.title} style={styles.stepItem}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
          onPress={handleLogout}
        >
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
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  errorContainer: {
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#ff9d9d',
  },
  addressBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  addressLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },
  addressText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: MONOSPACE_FONT,
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
  guideCard: {
    marginTop: 4,
    backgroundColor: '#151515',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262626',
    padding: 14,
    gap: 12,
  },
  guideTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  stepItem: {
    gap: 4,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  stepDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: '#c4c4c4',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
