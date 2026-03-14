import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
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
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAuthStore } from '@/stores/authStore';
import { colors, radius, shadow, spacing, typography } from '@/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

const getQueryString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
};

const featureItems = [
  {
    emoji: '📧',
    title: 'メール自動解析',
    description: 'Gmail連携で選考メールから予定を自動抽出します',
  },
  {
    emoji: '📅',
    title: '選考を一元管理',
    description: '企業状況と面接予定を同じ画面で確認できます',
  },
  {
    emoji: '🔔',
    title: '締切を見逃さない',
    description: '直近の締切や面接予定を見やすく通知します',
  },
] as const;

export default function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const { setTokens, setUser } = useAuthStore();

  const handleDeepLink = useCallback(
    async (url: string) => {
      const parsed = Linking.parse(url);

      if (!url.startsWith('jobsync://auth/callback')) {
        return;
      }

      const params = parsed.queryParams as Record<string, unknown> | null;
      if (!params) {
        return;
      }

      const accessToken = getQueryString(params.access_token);
      const refreshToken = getQueryString(params.refresh_token);
      const userId = getQueryString(params.user_id);
      const email = getQueryString(params.email);
      const name = getQueryString(params.name);

      if (!accessToken || !refreshToken || !userId || !email) {
        Alert.alert('ログインエラー', 'トークンの取得に失敗しました。もう一度お試しください。');
        return;
      }

      setTokens(accessToken, refreshToken);
      setUser({
        id: userId,
        email,
        name: name || email,
      });
    },
    [setTokens, setUser],
  );

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleDeepLink(url);
    });

    Linking.getInitialURL().then((url) => {
      if (url) {
        void handleDeepLink(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink]);

  const handleGoogleLogin = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const { url } = await authApi.getGoogleLoginUrl();

      const result = await WebBrowser.openAuthSessionAsync(url, 'jobsync://auth/callback');

      if (result.type === 'success' && result.url) {
        await handleDeepLink(result.url);
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('ログインエラー', 'ログインに失敗しました。ネットワーク接続を確認してください。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundOrbTop} />
      <View style={styles.backgroundOrbBottom} />

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoEmoji}>🔍</Text>
          </View>
          <Text style={styles.appName}>JobSync</Text>
          <Text style={styles.tagline}>就活を、漏れなく、迷わず進める。</Text>
        </View>

        <View style={styles.features}>
          {featureItems.map((feature) => (
            <AppCard key={feature.title} style={styles.featureCard}>
              <View style={styles.featureRow}>
                <Text style={styles.featureEmoji}>{feature.emoji}</Text>
                <View style={styles.featureTextArea}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDescription}>{feature.description}</Text>
                </View>
              </View>
            </AppCard>
          ))}
        </View>

        <View style={styles.footer}>
          <AppButton
            label={isLoading ? 'Google連携中...' : 'Googleでログイン'}
            onPress={() => {
              void handleGoogleLogin();
            }}
            loading={isLoading}
            style={styles.loginButton}
          />

          <Text style={styles.disclaimer}>
            ログインすることで、<Text style={styles.disclaimerLink}>利用規約</Text> と
            <Text style={styles.disclaimerLink}> プライバシーポリシー</Text> に同意したものとみなします。
          </Text>
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
  backgroundOrbTop: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#DBEAFE66',
    top: -70,
    right: -70,
  },
  backgroundOrbBottom: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#BFDBFE59',
    bottom: -60,
    left: -50,
  },
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: Platform.OS === 'ios' ? 24 : 32,
    paddingBottom: 42,
    gap: 22,
  },
  header: {
    gap: 8,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  logoEmoji: {
    fontSize: 30,
  },
  appName: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.4,
  },
  tagline: {
    fontSize: typography.body,
    color: colors.subtext,
    lineHeight: 22,
    fontWeight: '500',
  },
  features: {
    gap: 12,
  },
  featureCard: {
    padding: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureEmoji: {
    fontSize: 24,
    width: 30,
    textAlign: 'center',
  },
  featureTextArea: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  featureDescription: {
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  footer: {
    gap: 14,
    marginTop: 8,
  },
  loginButton: {
    ...shadow.floating,
  },
  disclaimer: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  disclaimerLink: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },
});
