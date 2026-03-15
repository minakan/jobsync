import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { authApi } from '@/api/auth';
import { usersApi } from '@/api/users';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useAuthStore } from '@/stores/authStore';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const forwardingSteps: { title: string; description: string }[] = [
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
      'Gmailから確認メールが届きます。JobSyncが自動で承認するので、そのまま1〜2分待機してください。',
  },
  {
    title: 'STEP 5: フィルタを設定（推奨）',
    description:
      '就活関連メールだけを転送するフィルタを設定すると効率的です。例: 件名に「選考」「面接」。',
  },
];

const MONOSPACE_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export default function SettingsScreen() {
  const logout = useAuthStore((state) => state.logout);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [isCopied, setIsCopied] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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

  const executeAccountDeletion = async (): Promise<void> => {
    if (isDeletingAccount) {
      return;
    }

    try {
      setIsDeletingAccount(true);
      await authApi.deleteAccount();
      clearAuth();
      router.replace('/auth');
    } catch (error) {
      console.error('Account deletion error:', error);
      Alert.alert(
        'アカウント削除エラー',
        'アカウントの削除に失敗しました。時間をおいて再度お試しください。',
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const showFinalDeleteConfirmation = (): void => {
    Alert.alert('最終確認', 'アカウントを完全に削除します。本当によろしいですか？', [
      {
        text: 'キャンセル',
        style: 'cancel',
      },
      {
        text: '削除する',
        style: 'destructive',
        onPress: () => {
          void executeAccountDeletion();
        },
      },
    ]);
  };

  const handleDeleteAccountPress = (): void => {
    Alert.alert('アカウント削除', '本当に削除しますか？この操作は取り消せません。', [
      {
        text: 'キャンセル',
        style: 'cancel',
      },
      {
        text: '削除する',
        style: 'destructive',
        onPress: showFinalDeleteConfirmation,
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <SectionHeader title="設定" subtitle="Gmail転送の初期設定とアカウント管理" />

        <AppCard style={styles.block}>
          <SectionHeader
            title="Gmail 連携"
            subtitle="自動転送を設定すると、選考メールから予定を自動取り込みします。"
          />

          {forwardingAddressQuery.isLoading ? (
            <View style={styles.inlineState}>
              <Text style={styles.stateText}>転送アドレスを取得中...</Text>
            </View>
          ) : forwardingAddressQuery.isError ? (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>転送アドレスを取得できませんでした。</Text>
              <AppButton
                label="再試行"
                onPress={() => {
                  void forwardingAddressQuery.refetch();
                }}
                compact
                loading={forwardingAddressQuery.isFetching}
              />
            </View>
          ) : (
            <>
              <View style={styles.addressBox}>
                <Text style={styles.addressLabel}>転送先アドレス</Text>
                <Text style={styles.addressText}>
                  {forwardingAddressQuery.data?.forwarding_email ?? ''}
                </Text>
              </View>

              <AppButton
                label={isCopied ? 'コピーしました' : '転送アドレスをコピー'}
                onPress={() => {
                  void handleCopyPress();
                }}
              />
            </>
          )}
        </AppCard>

        <AppCard style={styles.block}>
          <SectionHeader title="設定ガイド" subtitle="初回のみ5ステップで完了します。" />

          <View style={styles.steps}>
            {forwardingSteps.map((step) => (
              <View key={step.title} style={styles.stepItem}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </View>
            ))}
          </View>
        </AppCard>

        <View style={styles.accountActions}>
          <AppButton label="ログアウト" variant="danger" onPress={handleLogout} />
          <AppButton
            label="アカウントを削除する"
            variant="danger"
            onPress={handleDeleteAccountPress}
            disabled={isDeletingAccount}
            loading={isDeletingAccount}
            style={styles.deleteAccountButton}
            textStyle={styles.deleteAccountButtonText}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 16 : 24,
    paddingBottom: 40,
    gap: spacing.md,
  },
  block: {
    gap: spacing.md,
  },
  inlineState: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    color: colors.subtext,
    fontSize: typography.caption,
    fontWeight: '600',
  },
  errorState: {
    gap: 10,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  addressBox: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 14,
    gap: 6,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  addressText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: MONOSPACE_FONT,
    fontWeight: '600',
  },
  steps: {
    gap: 10,
  },
  stepItem: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryBorder,
    paddingLeft: 12,
    gap: 4,
  },
  stepTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  stepDescription: {
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  accountActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  deleteAccountButton: {
    borderColor: '#FF3B30',
  },
  deleteAccountButtonText: {
    color: '#FF3B30',
  },
});
