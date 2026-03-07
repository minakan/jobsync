import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

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
