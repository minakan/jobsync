import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import Constants from 'expo-constants';

import { useAuthStore } from '../stores/authStore';

/**
 * APIのベースURLを自動解決する。
 * - 開発中（Expo Go）: MetroサーバーのIPから自動取得
 *   例) hostUri = "192.168.11.5:8082" → "http://192.168.11.5:8000/api/v1"
 * - 本番 or 明示設定: EXPO_PUBLIC_API_URL 環境変数を使用
 */
function resolveApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  // Expo Go 開発中: hostUri から IP を抽出してバックエンドポートに向ける
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:8000/api/v1`;
  }
  return 'http://localhost:8000/api/v1';
}

const API_BASE_URL = resolveApiBaseUrl();

interface RefreshTokenPayload {
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const parseRefreshPayload = (
  payload: unknown,
): { accessToken: string; refreshToken?: string } | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const data = payload as RefreshTokenPayload;
  const accessToken = data.accessToken ?? data.access_token;

  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken: data.refreshToken ?? data.refresh_token,
  };
};

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
});

let refreshRequestPromise: Promise<{ accessToken: string; refreshToken: string }> | null = null;

const requestTokenRefresh = async (
  currentRefreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> => {
  if (!refreshRequestPromise) {
    refreshRequestPromise = (async () => {
      const response = await refreshClient.post<unknown>('/auth/refresh', {
        refreshToken: currentRefreshToken,
        refresh_token: currentRefreshToken,
      });

      const parsed = parseRefreshPayload(response.data);

      if (!parsed) {
        throw new Error('Refresh token response did not include access token');
      }

      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken ?? currentRefreshToken,
      };
    })().finally(() => {
      refreshRequestPromise = null;
    });
  }

  return refreshRequestPromise;
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { accessToken } = useAuthStore.getState();

  if (accessToken) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    config.headers = headers;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const { refreshToken, logout, setTokens } = useAuthStore.getState();

    if (!refreshToken) {
      logout();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const tokens = await requestTokenRefresh(refreshToken);
      setTokens(tokens.accessToken, tokens.refreshToken);

      const headers = AxiosHeaders.from(originalRequest.headers);
      headers.set('Authorization', `Bearer ${tokens.accessToken}`);
      originalRequest.headers = headers;

      return apiClient(originalRequest);
    } catch (refreshError) {
      logout();
      return Promise.reject(refreshError);
    }
  },
);
