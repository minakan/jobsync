/**
 * ログイン画面
 *
 * フロー:
 *  1. "Googleでログイン" タップ
 *  2. バックエンドから OAuth URL を取得
 *  3. expo-web-browser でブラウザを開く
 *  4. Google認証後、バックエンドが jobsync://auth/callback?access_token=...&refresh_token=... にリダイレクト
 *  5. expo-linking がdeep linkを受け取り、トークンを保存してホーム画面へ
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';

// Androidでブラウザセッションを完了させるために必要
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

export default function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const { setTokens, setUser } = useAuthStore();

  // deep link ハンドラ（jobsync://auth/callback?... を受け取る）
  const handleDeepLink = useCallback(
    async (url: string) => {
      const parsed = Linking.parse(url);

      // jobsync://auth/callback かどうか確認
      // Linking.parse は jobsync://auth/callback を hostname='auth', path='callback' に分解するため
      // raw URL で判定する
      if (!url.startsWith('jobsync://auth/callback')) return;

      const params = parsed.queryParams as Record<string, unknown> | null;
      if (!params) return;

      const accessToken = getQueryString(params.access_token);
      const refreshToken = getQueryString(params.refresh_token);
      const userId = getQueryString(params.user_id);
      const email = getQueryString(params.email);
      const name = getQueryString(params.name);

      if (!accessToken || !refreshToken || !userId || !email) {
        Alert.alert('ログインエラー', 'トークンの取得に失敗しました。もう一度お試しください。');
        return;
      }

      // トークンとユーザー情報を保存
      setTokens(accessToken, refreshToken);
      setUser({
        id: userId,
        email,
        name: name || email,
      });
    },
    [setTokens, setUser],
  );

  // deep link イベントをリッスン
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    // アプリが閉じた状態からdeep linkで開かれた場合
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    return () => subscription.remove();
  }, [handleDeepLink]);

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);

      // バックエンドからOAuth URLを取得
      const { url } = await authApi.getGoogleLoginUrl();

      // ブラウザでGoogleログインを開く
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        'jobsync://auth/callback', // redirect URLのprefixを指定
      );

      if (result.type === 'success' && result.url) {
        // iOS: openAuthSessionAsync が直接URLを返すケース
        await handleDeepLink(result.url);
      }
      // Android: deep link経由でhandleDeepLinkが呼ばれる
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert(
        'ログインエラー',
        'ログインに失敗しました。ネットワーク接続を確認してください。',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ロゴ・タイトル */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoEmoji}>🔍</Text>
        </View>
        <Text style={styles.appName}>JobSync</Text>
        <Text style={styles.tagline}>就活を、もっとスマートに。</Text>
      </View>

      {/* 機能説明 */}
      <View style={styles.features}>
        <FeatureItem emoji="📧" title="メール自動解析" desc="Gmailを連携してES・面接の予定を自動取得" />
        <FeatureItem emoji="📅" title="スケジュール管理" desc="選考状況をカレンダーで一元管理" />
        <FeatureItem emoji="🔔" title="リマインダー通知" desc="面接前日に自動でプッシュ通知" />
      </View>

      {/* ログインボタン */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed]}
          onPress={handleGoogleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Googleでログイン</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.disclaimer}>
          ログインすることで{'\n'}
          <Text style={styles.link}>利用規約</Text> および{' '}
          <Text style={styles.link}>プライバシーポリシー</Text> に同意したものとみなします
        </Text>
      </View>
    </View>
  );
}

function FeatureItem({
  emoji,
  title,
  desc,
}: {
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureEmoji}>{emoji}</Text>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#6C63FF33',
  },
  logoEmoji: {
    fontSize: 36,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  features: {
    flex: 1,
    gap: 20,
    marginTop: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  featureEmoji: {
    fontSize: 28,
    width: 40,
    textAlign: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    color: '#777',
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
    gap: 16,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6C63FF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    gap: 10,
    minHeight: 56,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  googleButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    fontStyle: 'italic',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.3,
  },
  disclaimer: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    lineHeight: 16,
  },
  link: {
    color: '#6C63FF',
  },
});
