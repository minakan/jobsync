import { apiClient } from './client';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

export const authApi = {
  /**
   * Google OAuth2 認証URLを取得する
   * 返ってきた url を expo-web-browser で開く
   */
  getGoogleLoginUrl: async (): Promise<{ url: string }> => {
    const res = await apiClient.get('/auth/google/login');
    return res.data;
  },

  /**
   * リフレッシュトークンで新しいアクセストークンを取得する
   */
  refresh: async (refreshToken: string): Promise<TokenResponse> => {
    const res = await apiClient.post('/auth/refresh', {
      refresh_token: refreshToken,
    });
    return res.data;
  },

  /**
   * ログアウト（サーバー側はステートレス、クライアント側でトークンを削除）
   */
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  /**
   * 現在の認証済みユーザー情報を取得する
   */
  getMe: async (): Promise<UserInfo> => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },
};
